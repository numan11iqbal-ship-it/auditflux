export type AuditSection = 'overview' | 'issues' | 'headings' | 'links' | 'images' | 'schema' | 'geo' | 'performance' | 'accessibility' | 'technical' | 'security' | 'resources' | 'source' | 'history' | 'projects' | 'reports' | 'settings' | 'connect-extension';

const auditSections = new Set<AuditSection>(['overview', 'issues', 'headings', 'links', 'images', 'schema', 'geo', 'performance', 'accessibility', 'technical', 'security', 'resources', 'source', 'reports']);

export function isAuditSection(value: string): value is AuditSection {
  return auditSections.has(value as AuditSection);
}

export function routeSection(path: string): AuditSection {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts[0] === 'audit') return isAuditSection(parts[2] || '') ? parts[2] as AuditSection : 'overview';
  return (parts[0] as AuditSection) || 'overview';
}

export function auditIdFromLocation(path: string) {
  if (!path.startsWith('/audit/')) return null;
  const id = path.split('?')[0].split('/')[2];
  return id ? decodeURIComponent(id) : null;
}

export function auditPath(auditId: string, section: AuditSection = 'overview') {
  return `/audit/${encodeURIComponent(auditId)}/${section}`;
}
