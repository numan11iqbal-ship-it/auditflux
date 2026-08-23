const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { cloneWithoutSecrets } = require('../../packages/seo-engine/audit-contract');

const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function supabaseServerConfig() {
  const explicitUrl = process.env.AUDITFLUX_SUPABASE_URL;
  const explicitServiceRoleKey = process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY;
  const source = explicitUrl && explicitServiceRoleKey ? 'auditflux' : 'integration';
  return {
    url: explicitUrl || required('SUPABASE_URL'),
    serviceRoleKey: explicitServiceRoleKey || required('SUPABASE_SERVICE_ROLE_KEY'),
    source,
  };
}

function adminClient() {
  const { url, serviceRoleKey } = supabaseServerConfig();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function publicRuntimeStatus() {
  const configured = Boolean((process.env.AUDITFLUX_SUPABASE_URL && process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY) || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY));
  const supabaseUrl = process.env.AUDITFLUX_SUPABASE_URL || process.env.SUPABASE_URL;
  let supabaseHost = null;
  try { supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : null; } catch { supabaseHost = null; }
  return {
    supabase: { configured, host: supabaseHost, source: process.env.AUDITFLUX_SUPABASE_URL && process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY ? 'auditflux' : 'integration' },
    pagespeed: { configured: Boolean(process.env.PAGESPEED_API_KEY) },
    crux: { configured: Boolean(process.env.CRUX_API_KEY) },
  };
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').end(JSON.stringify(body));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = [process.env.AUDITFLUX_SITE_URL, 'https://auditflux.vercel.app', process.env.AUDITFLUX_EXTENSION_ORIGIN].filter(Boolean);
  if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-AuditFlux-Extension-Session');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

function parseBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

function bearer(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

function extensionSessionHash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

async function extensionSessionIdentityFor(db, token, now = new Date().toISOString()) {
  if (typeof token !== 'string' || !token) return null;
  const { data: session, error } = await db.from('extension_sessions').select('id,connection_id,expires_at,revoked_at').eq('token_hash', extensionSessionHash(token)).maybeSingle();
  if (error) throw error;
  if (!session || session.revoked_at || session.expires_at <= now) throw Object.assign(new Error('Extension connection has expired. Reconnect AuditFlux Extension to continue.'), { status: 401 });
  const { data: connection, error: connectionError } = await db.from('extension_connections').select('id,user_id,workspace_id,status').eq('id', session.connection_id).maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection || connection.status !== 'connected') throw Object.assign(new Error('Extension connection is not active.'), { status: 401 });
  await Promise.all([db.from('extension_sessions').update({ last_seen_at: now }).eq('id', session.id), db.from('extension_connections').update({ last_seen_at: now }).eq('id', connection.id)]);
  return { db, user: { id: connection.user_id }, extensionConnection: connection };
}

async function extensionSessionIdentity(req) {
  const token = req.headers['x-auditflux-extension-session'];
  return extensionSessionIdentityFor(adminClient(), token);
}

async function requireUser(req) {
  const extensionIdentity = await extensionSessionIdentity(req);
  if (extensionIdentity) return extensionIdentity;
  const token = bearer(req);
  if (!token) throw Object.assign(new Error('Authentication is required.'), { status: 401 });
  const db = adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Session is invalid or expired.'), { status: 401 });
  return { db, user: data.user };
}

async function workspaceFor(db, userId) {
  const { data, error } = await db.from('workspace_members').select('workspace_id,role').eq('user_id', userId).order('created_at').limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('No AuditFlux workspace is available for this account.'), { status: 403 });
  return data.workspace_id;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return null;
    return url;
  } catch { return null; }
}

function hostName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'website'; }
}

function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }

async function projectForAudit(db, userId, workspaceId, body) {
  if (body.projectId) {
    const { data, error } = await db.from('projects').select('id,workspace_id').eq('id', body.projectId).eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('The selected project does not belong to this workspace.'), { status: 404 });
    return data;
  }
  const url = safeHttpUrl(body.url);
  if (!url) throw Object.assign(new Error('A public audit URL is required.'), { status: 400 });
  const { data: prior, error: priorError } = await db.from('projects').select('id,workspace_id').eq('workspace_id', workspaceId).eq('primary_url', url.href).maybeSingle();
  if (priorError) throw priorError;
  if (prior) return prior;
  const { data, error } = await db.from('projects').insert({
    workspace_id: workspaceId,
    name: `Audit: ${hostName(url.href)}`,
    domain: hostName(url.href),
    primary_url: url.href,
    urls: [url.href],
    created_by: userId,
  }).select('id,workspace_id').single();
  if (error) throw error;
  return data;
}

function auditRow(payload, project, workspaceId, userId) {
  const coverage = payload.coverage || {};
  return {
    client_audit_id: payload.clientAuditId,
    workspace_id: workspaceId,
    project_id: project.id,
    created_by: userId,
    url: payload.url,
    canonical_url: payload.canonicalUrl || null,
    engine_version: payload.engineVersion || 'unknown',
    contract_version: payload.contractVersion || '1.0.0',
    captured_at: payload.capturedAt || new Date().toISOString(),
    overall_score: numeric(payload.overallScore),
    coverage_total: numeric(coverage.total) || 0,
    coverage_applicable: numeric(coverage.applicable) || 0,
    pass_count: numeric(coverage.pass) || 0,
    warn_count: numeric(coverage.warn) || 0,
    fail_count: numeric(coverage.fail) || 0,
    critical_count: numeric(coverage.critical) || 0,
    notice_count: numeric(coverage.notice) || 0,
    na_count: numeric(coverage.na) || 0,
    payload: cloneWithoutSecrets(payload),
  };
}

async function insertDetails(db, auditId, payload) {
  const work = [];
  const categories = (payload.categories || []).map(item => ({ audit_id: auditId, category_id: item.id, label: item.label || item.id, score: numeric(item.score), applicable: Boolean(item.applicable), checks: numeric(item.checks) || 0, passed: numeric(item.passed) || 0, failed: numeric(item.failed) || 0, source: item.source === 'LIVE' || item.source === 'LAB' || item.source === 'FIELD' || item.source === 'BACKEND' ? item.source : 'CALCULATED' }));
  if (categories.length) work.push(db.from('audit_categories').insert(categories));
  const issues = (payload.issues || []).map(item => ({ audit_id: auditId, issue_key: item.id, rule_id: item.ruleId || null, category: item.category || 'uncategorized', severity: ['critical', 'warning', 'notice', 'info'].includes(item.severity) ? item.severity : 'notice', title: item.title || 'Untitled issue', detected: item.detected || null, expected: item.expected || null, why: item.why || null, recommendation: item.recommendation || null, evidence: cloneWithoutSecrets(item.evidence || []), status: ['pass', 'fail', 'warn', 'na', 'unavailable'].includes(item.status) ? item.status : 'fail', locator: cloneWithoutSecrets(item.locator || null), provenance: cloneWithoutSecrets(item.provenance || {}) }));
  if (issues.length) work.push(db.from('audit_issues').insert(issues));
  const headings = (payload.detail?.headings || []).map((item, position) => ({ audit_id: auditId, position, level: item.level, text: item.text || null, length: numeric(item.length) || 0, empty: Boolean(item.empty), is_question: Boolean(item.isQuestion), locator: cloneWithoutSecrets(item.locator || null) }));
  if (headings.length) work.push(db.from('audit_headings').insert(headings));
  const links = (payload.detail?.links || []).map((item, position) => ({ audit_id: auditId, position, href: item.href || null, absolute_url: item.absolute || null, anchor: item.anchor || null, link_type: item.type || 'other', rel: item.rel || null, target: item.target || null, nofollow: Boolean(item.nofollow), sponsored: Boolean(item.sponsored), ugc: Boolean(item.ugc), locator: cloneWithoutSecrets(item.locator || null) }));
  if (links.length) work.push(db.from('audit_links').insert(links));
  const images = (payload.detail?.images || []).map((item, position) => ({ audit_id: auditId, position, src: item.src || null, alt: item.alt || null, alt_missing: Boolean(item.altMissing), alt_empty: Boolean(item.altEmpty), alt_length: numeric(item.altLength) || 0, width: numeric(item.naturalWidth), height: numeric(item.naturalHeight), broken: Boolean(item.broken), format: item.format || null, locator: cloneWithoutSecrets(item.locator || null) }));
  if (images.length) work.push(db.from('audit_images').insert(images));
  const blocks = (payload.detail?.schema?.blocks || []).map((item, position) => ({ audit_id: auditId, position, valid: Boolean(item.valid), error: item.error || null, types: item.types || [], has_context: Boolean(item.hasContext), payload: cloneWithoutSecrets(item) }));
  if (blocks.length) work.push(db.from('audit_schema_entities').insert(blocks));
  const resources = (payload.detail?.resources || []).map((item, position) => ({ audit_id: auditId, position, url: item.url || null, kind: item.kind || null, initiator: item.initiator || null, duration_ms: numeric(item.durationMs), transfer_bytes: numeric(item.transferBytes), decoded_bytes: numeric(item.decodedBytes), cached: Boolean(item.cached), cross_origin: Boolean(item.crossOrigin), render_blocking_candidate: Boolean(item.renderBlockingCandidate) }));
  if (resources.length) work.push(db.from('audit_resources').insert(resources));
  const sourceRows = [['live', 'LIVE'], ['lab', 'LAB'], ['field', 'FIELD']].flatMap(([key, source]) => {
    const supplied = payload.performance?.[key];
    const items = Array.isArray(supplied) ? supplied : supplied ? [supplied] : [];
    return items.map(item => {
      const scores = item.scores || item.data?.scores || {};
      return { audit_id: auditId, source, strategy: item.strategy || item.data?.strategy || 'default', performance_score: numeric(scores.performance), accessibility_score: numeric(scores.accessibility), best_practices_score: numeric(scores.bestPractices), seo_score: numeric(scores.seo), metrics: cloneWithoutSecrets(item.metrics || item.data?.metrics || item.data || {}), raw_summary: cloneWithoutSecrets(item) };
    });
  });
  if (sourceRows.length) work.push(db.from('performance_results').insert(sourceRows));
  const geoAeo = (payload.geoAeo || []).map(item => ({ audit_id: auditId, signal_key: item.signalKey, status: item.status || 'unavailable', title: item.title || null, detected: item.detected || null, expected: item.expected || null, evidence: cloneWithoutSecrets(item.evidence || []), locator: cloneWithoutSecrets(item.locator || null), provenance: cloneWithoutSecrets(item.provenance || {}) }));
  if (geoAeo.length) work.push(db.from('audit_geo_aeo_records').insert(geoAeo));
  const provenance = Object.entries(payload.provenance || {}).filter(([, value]) => value).map(([domain, value]) => ({ audit_id: auditId, domain, source: value.source === 'LIVE' || value.source === 'LAB' || value.source === 'FIELD' || value.source === 'BACKEND' ? value.source : 'CALCULATED', label: value.label || null, method: value.method || null, payload: cloneWithoutSecrets(value) }));
  if (provenance.length) work.push(db.from('audit_provenance').insert(provenance));
  const results = await Promise.all(work);
  for (const result of results) if (result.error) throw result.error;
}

async function persistAudit(req) {
  const { db, user } = await requireUser(req);
  const body = cloneWithoutSecrets(parseBody(req));
  if (JSON.stringify(body).length > MAX_PAYLOAD_BYTES) throw Object.assign(new Error('Audit payload exceeds the maximum allowed size.'), { status: 413 });
  if (!body.clientAuditId || !safeHttpUrl(body.url)) throw Object.assign(new Error('A normalized audit with a public URL is required.'), { status: 400 });
  const workspaceId = await workspaceFor(db, user.id);
  const project = await projectForAudit(db, user.id, workspaceId, body);
  const { data: existing, error: existingError } = await db.from('audits').select('id').eq('client_audit_id', body.clientAuditId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { auditId: existing.id, projectId: project.id, duplicate: true };
  const { data: audit, error } = await db.from('audits').insert(auditRow(body, project, workspaceId, user.id)).select('id').single();
  if (error) throw error;
  await insertDetails(db, audit.id, body);
  const usage = await db.from('usage_records').insert({ workspace_id: workspaceId, user_id: user.id, operation: 'audit_saved', audit_id: audit.id });
  if (usage.error) throw usage.error;
  return { auditId: audit.id, projectId: project.id, duplicate: false };
}

async function ownedAudit(db, userId, auditId) {
  const workspaceId = await workspaceFor(db, userId);
  const { data, error } = await db.from('audits').select('*').eq('id', auditId).eq('workspace_id', workspaceId).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('Audit not found.'), { status: 404 });
  return data;
}

async function loadAudit(req, auditId) {
  const { db, user } = await requireUser(req);
  const audit = await ownedAudit(db, user.id, auditId);
  const tables = ['audit_categories', 'audit_issues', 'audit_headings', 'audit_links', 'audit_images', 'audit_schema_entities', 'audit_resources', 'performance_results', 'audit_provenance'];
  const rows = await Promise.all(tables.map(table => db.from(table).select('*').eq('audit_id', auditId)));
  for (const row of rows) if (row.error) throw row.error;
  return { audit, categories: rows[0].data, issues: rows[1].data, headings: rows[2].data, links: rows[3].data, images: rows[4].data, schema: rows[5].data, resources: rows[6].data, performance: rows[7].data, provenance: rows[8].data };
}

function failure(res, error) { json(res, error.status || 500, { error: error.message || 'AuditFlux API request failed.' }); }

module.exports = { adminClient, applyCors, json, parseBody, requireUser, workspaceFor, safeHttpUrl, hostName, persistAudit, loadAudit, ownedAudit, failure, publicRuntimeStatus, supabaseServerConfig, extensionSessionHash, extensionSessionIdentity, extensionSessionIdentityFor };
