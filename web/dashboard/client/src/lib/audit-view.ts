export type AuditSection = 'overview' | 'issues' | 'headings' | 'links' | 'images' | 'schema' | 'geo' | 'performance' | 'accessibility' | 'technical' | 'resources' | 'history' | 'projects' | 'reports' | 'settings';

export function routeSection(path: string): AuditSection {
  if (path.startsWith('/audit/')) return 'overview';
  return (path.split('/')[1] as AuditSection) || 'overview';
}

export function auditIdFromLocation(path: string) {
  if (!path.startsWith('/audit/')) return null;
  const id = path.split('/')[2];
  return id ? decodeURIComponent(id) : null;
}
