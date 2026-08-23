export type SavedAudit = {
  audit: Record<string, any>;
  categories: Record<string, any>[];
  issues: Record<string, any>[];
  headings: Record<string, any>[];
  links: Record<string, any>[];
  images: Record<string, any>[];
  schema: Record<string, any>[];
  resources: Record<string, any>[];
  performance: Record<string, any>[];
  provenance: Record<string, any>[];
};

export function normalizeSavedAudit(value: unknown): SavedAudit {
  const response = value as Partial<SavedAudit> | null;
  if (!response?.audit || typeof response.audit.id !== 'string') {
    throw new Error('Saved audit detail response is missing its core audit record.');
  }
  return {
    audit: response.audit,
    categories: response.categories || [],
    issues: response.issues || [],
    headings: response.headings || [],
    links: response.links || [],
    images: response.images || [],
    schema: response.schema || [],
    resources: response.resources || [],
    performance: response.performance || [],
    provenance: response.provenance || [],
  };
}

function canonicalAuditUrl(value: unknown) {
  try { const url = new URL(String(value || '')); if (!/^https?:$/.test(url.protocol) || !url.hostname) return null; url.hash = ''; return url.href; } catch { return null; }
}

export function verifySavedAuditIdentity(saved: SavedAudit, expected: { auditId: string; normalizedUrl: string }) {
  const returnedUrl = canonicalAuditUrl(saved.audit.url);
  const auditIdMatch = String(saved.audit.id) === expected.auditId;
  const urlMatch = returnedUrl === expected.normalizedUrl;
  const context = saved.audit.payload && typeof saved.audit.payload === 'object' ? (saved.audit.payload as Record<string, unknown>).auditContext : null;
  const extensionContext = context && typeof context === 'object' ? context as Record<string, unknown> : null;
  const contextAuditIdMatch = extensionContext?.source === 'extension' && extensionContext.auditId === expected.auditId;
  const contextUrlMatch = canonicalAuditUrl(extensionContext?.normalizedUrl) === expected.normalizedUrl && canonicalAuditUrl(extensionContext?.auditedUrl) === expected.normalizedUrl;
  if (import.meta.env.DEV) console.debug('AUDIT VALIDATION', { auditId: expected.auditId, auditedUrl: expected.normalizedUrl, auditIdMatch, urlMatch, contextAuditIdMatch, contextUrlMatch });
  if (!auditIdMatch || !urlMatch || !contextAuditIdMatch || !contextUrlMatch) throw new Error('Audit verification failed. The returned audit does not match the current extension audit.');
  return { auditIdMatch, urlMatch };
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'AuditFlux backend unavailable.');
  return body as T;
}

export const auditApi = {
  history: (token: string) => request<{ audits: Record<string, any>[] }>('/api/audits/history', token),
  audit: async (token: string, id: string) => normalizeSavedAudit(await request<unknown>(`/api/audits/${encodeURIComponent(id)}`, token)),
  currentExtensionAudit: async (token: string, expected: { auditId: string; normalizedUrl: string }) => { if (import.meta.env.DEV) console.debug('WEB APP AUDIT REQUESTED', { auditId: expected.auditId, auditedUrl: expected.normalizedUrl }); const saved = normalizeSavedAudit(await request<unknown>(`/api/audits/${encodeURIComponent(expected.auditId)}`, token)); if (import.meta.env.DEV) console.debug('SUPABASE AUDIT RETURNED', { auditId: saved.audit.id, auditedUrl: saved.audit.url }); verifySavedAuditIdentity(saved, expected); return saved; },
  projects: (token: string) => request<{ projects: Record<string, any>[] }>('/api/projects', token),
  createProject: (token: string, input: { name: string; primaryUrl: string }) => request<{ project: Record<string, any> }>('/api/projects', token, { method: 'POST', body: JSON.stringify(input) }),
};
