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
