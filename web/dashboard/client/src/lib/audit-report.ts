import type { SavedAudit } from './audit-api';

export type AuditRecord = Record<string, unknown>;

export function record(value: unknown): AuditRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AuditRecord : {};
}

export function list(value: unknown): AuditRecord[] {
  return Array.isArray(value) ? value.map(record).filter(item => Object.keys(item).length > 0) : [];
}

export function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function auditDetail(saved: SavedAudit | null) {
  const audit = record(saved?.audit);
  const payload = record(audit.payload);
  return record(payload.detail);
}

export function pageEssentials(saved: SavedAudit | null) {
  const detail = auditDetail(saved); const stored = record(detail.pageEssentials);
  if (Object.keys(stored).length) return stored;
  const page = record(detail.page); const head = record(detail.head); const type = record(detail.pageType); const source = record(detail.source); const robots = record(detail.robots);
  const navigationStatus = number(page.httpStatus); const sourceStatus = number(source.status); const status = navigationStatus ?? sourceStatus;
  const indexability = head.noindex === true ? 'noindex' : robots.pageAllowed === false ? 'blocked' : robots.pageAllowed === true ? 'indexable' : 'unknown';
  const rawReasons = Array.isArray(type.reasons) ? type.reasons.map(text).filter((value): value is string => Boolean(value)) : [];
  const legacyType = text(type.type);
  return {
    url: text(record(saved?.audit).url), urlSource: 'legacy_payload', fetchedUrl: text(page.url), httpStatus: status,
    httpStatusSource: navigationStatus !== null ? 'extension_navigation' : sourceStatus !== null ? 'server_fetch' : 'unavailable',
    httpStatusAvailability: status === null ? 'unavailable' : 'available', indexability,
    indexabilityReason: indexability === 'noindex' ? 'Legacy saved metadata contains a noindex directive.' : indexability === 'blocked' ? 'Legacy saved robots evidence blocks the audited path.' : indexability === 'indexable' ? 'Legacy saved robots evidence permits the audited path.' : 'This legacy audit did not retain enough evidence to determine indexability.',
    indexabilitySource: head.noindex === true ? 'meta_robots' : robots.pageAllowed !== undefined ? 'robots_txt' : 'unavailable', canonicalUrl: text(head.canonical), canonicalStatus: text(head.canonical) ? 'present' : 'missing', canonicalSource: text(head.canonical) ? 'legacy_payload' : 'unavailable', canonicalEvidence: text(head.canonical) ? 'Canonical retained by a legacy saved audit.' : 'No canonical retained by this legacy saved audit.', pageType: legacyType === 'generic' ? 'unknown' : legacyType || 'unknown', pageTypeConfidence: legacyType && legacyType !== 'generic' ? 'legacy' : 'unavailable', pageTypeEvidence: rawReasons.length ? rawReasons : ['No reliable classification signal was retained by this legacy audit.'],
  };
}

export function auditCoverage(saved: SavedAudit | null) {
  const audit = record(saved?.audit);
  const applicable = number(audit.coverage_applicable) ?? 0;
  const pass = number(audit.pass_count) ?? 0;
  const critical = number(audit.critical_count) ?? 0;
  const warning = number(audit.warn_count) ?? 0;
  const notice = number(audit.notice_count) ?? 0;
  const notApplicable = number(audit.na_count) ?? 0;
  return { applicable, pass, critical, warning, notice, notApplicable, total: number(audit.coverage_total) ?? applicable + notApplicable };
}

export function sourceStatus(saved: SavedAudit | null) {
  const source = record(auditDetail(saved).source);
  const html = text(source.html);
  return { source, html, available: Boolean(html), reason: text(source.error) || 'The source HTML was not captured for this audit.' };
}

export function securityStatus(saved: SavedAudit | null) {
  const security = record(auditDetail(saved).security);
  const available = security.available === true;
  return { security, available, reason: text(record(auditDetail(saved).source).error) || 'Response headers were not captured for this audit.' };
}

export function categoryContribution(saved: SavedAudit | null) {
  const payload = record(record(saved?.audit).payload);
  const explanation = record(record(payload.audit).explanation);
  const normalizedCategories = list(payload.categories);
  return normalizedCategories.length ? normalizedCategories : list(explanation.contributions);
}

export function scoreMethod(saved: SavedAudit | null) {
  const payload = record(record(saved?.audit).payload);
  return text(record(record(payload.provenance).scores).method);
}

export function savedPerformance(saved: SavedAudit | null) {
  return (saved?.performance || []).map(record);
}
