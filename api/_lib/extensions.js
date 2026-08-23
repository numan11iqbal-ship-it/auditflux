const crypto = require('crypto');
const { adminClient, extensionSessionHash, extensionSessionIdentity, parseBody, requireUser, workspaceFor } = require('./auditflux');

const PAIRING_TTL_MS = 5 * 60 * 1000;
const EXTENSION_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const secret = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

async function browserUser(req) {
  if (!req.headers.authorization) throw Object.assign(new Error('Sign in to AuditFlux before connecting an extension.'), { status: 401 });
  return requireUser(req);
}

async function createChallenge(req) {
  const { db, user } = await browserUser(req); const workspaceId = await workspaceFor(db, user.id); const nonce = `af_conn_${secret(24)}`; const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const { error } = await db.from('extension_pairing_challenges').insert({ workspace_id: workspaceId, user_id: user.id, nonce_hash: extensionSessionHash(nonce), expires_at: expiresAt });
  if (error) throw error;
  return { nonce, expiresAt };
}

async function confirmChallenge(req) {
  const body = parseBody(req); const nonce = typeof body.nonce === 'string' ? body.nonce : ''; const installationId = typeof body.installationId === 'string' ? body.installationId : '';
  if (!nonce.startsWith('af_conn_') || installationId.length < 16 || installationId.length > 160) throw Object.assign(new Error('The extension connection request is invalid.'), { status: 400 });
  const db = adminClient(); const now = new Date().toISOString();
  const { data: challenge, error } = await db.from('extension_pairing_challenges').select('*').eq('nonce_hash', extensionSessionHash(nonce)).maybeSingle();
  if (error) throw error;
  if (!challenge || challenge.status !== 'pending' || challenge.consumed_at || challenge.expires_at <= now) throw Object.assign(new Error('This connection request has expired. Try connecting the extension again.'), { status: 410 });
  const { data: claimedChallenge, error: consumeError } = await db.from('extension_pairing_challenges').update({ status: 'connected', consumed_at: now }).eq('id', challenge.id).eq('status', 'pending').is('consumed_at', null).select('id').maybeSingle();
  if (consumeError) throw consumeError;
  if (!claimedChallenge) throw Object.assign(new Error('This connection request has expired. Try connecting the extension again.'), { status: 410 });
  const payload = { workspace_id: challenge.workspace_id, installation_id: installationId, user_id: challenge.user_id, extension_version: typeof body.extensionVersion === 'string' ? body.extensionVersion.slice(0, 40) : null, protocol_version: typeof body.protocolVersion === 'string' ? body.protocolVersion.slice(0, 40) : '1', browser: typeof body.browser === 'string' ? body.browser.slice(0, 80) : null, capabilities: Array.isArray(body.capabilities) ? body.capabilities.map(value => String(value).slice(0, 80)).slice(0, 20) : [], status: 'connected', connected_at: now, last_seen_at: now, disconnected_at: null };
  const { data: connection, error: connectionError } = await db.from('extension_connections').upsert(payload, { onConflict: 'workspace_id,installation_id' }).select('id,status,extension_version,capabilities,last_seen_at').single();
  if (connectionError) throw connectionError;
  const sessionToken = secret(); const expiresAt = new Date(Date.now() + EXTENSION_SESSION_TTL_MS).toISOString();
  const { error: sessionError } = await db.from('extension_sessions').insert({ connection_id: connection.id, token_hash: extensionSessionHash(sessionToken), expires_at: expiresAt });
  if (sessionError) throw sessionError;
  return { sessionToken, expiresAt, connection: { id: connection.id, status: connection.status, version: connection.extension_version, capabilities: connection.capabilities, lastSeenAt: connection.last_seen_at } };
}

async function connectionStatus(req) {
  const { db, user } = await browserUser(req); const workspaceId = await workspaceFor(db, user.id);
  const { data, error } = await db.from('extension_connections').select('id,status,extension_version,browser,capabilities,connected_at,last_seen_at,disconnected_at').eq('workspace_id', workspaceId).eq('user_id', user.id).order('updated_at', { ascending: false });
  if (error) throw error;
  return { connections: data || [] };
}

async function disconnect(req) {
  const extensionIdentity = await extensionSessionIdentity(req); const browserIdentity = extensionIdentity ? null : await browserUser(req); const { db, user } = extensionIdentity || browserIdentity; const connectionId = extensionIdentity?.extensionConnection?.id || String(parseBody(req).connectionId || ''); const workspaceId = extensionIdentity?.extensionConnection?.workspace_id || await workspaceFor(db, user.id);
  const { data: connection, error } = await db.from('extension_connections').select('id').eq('id', connectionId).eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!connection) throw Object.assign(new Error('Extension connection not found.'), { status: 404 });
  const now = new Date().toISOString(); const results = await Promise.all([db.from('extension_connections').update({ status: 'disconnected', disconnected_at: now }).eq('id', connection.id), db.from('extension_sessions').update({ revoked_at: now }).eq('connection_id', connection.id).is('revoked_at', null)]);
  for (const result of results) if (result.error) throw result.error;
  return { disconnected: true };
}

async function heartbeat(req) {
  const identity = await extensionSessionIdentity(req); if (!identity) throw Object.assign(new Error('Extension connection is required.'), { status: 401 });
  return { connected: true };
}

module.exports = { createChallenge, confirmChallenge, connectionStatus, disconnect, heartbeat };
