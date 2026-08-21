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

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'AuditFlux backend unavailable.');
  return body as T;
}

export const auditApi = {
  history: (token: string) => request<{ audits: Record<string, any>[] }>('/api/audits/history', token),
  audit: (token: string, id: string) => request<SavedAudit>(`/api/audits/${encodeURIComponent(id)}`, token),
  projects: (token: string) => request<{ projects: Record<string, any>[] }>('/api/projects', token),
  createProject: (token: string, input: { name: string; primaryUrl: string }) => request<{ project: Record<string, any> }>('/api/projects', token, { method: 'POST', body: JSON.stringify(input) }),
};
