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

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'AuditFlux backend unavailable.');
  return body as T;
}

export const auditApi = {
  history: (token: string) => request<{ audits: Record<string, any>[] }>('/api/audits/history', token),
  audit: async (token: string, id: string) => normalizeSavedAudit(await request<unknown>(`/api/audits/${encodeURIComponent(id)}`, token)),
  projects: (token: string) => request<{ projects: Record<string, any>[] }>('/api/projects', token),
  createProject: (token: string, input: { name: string; primaryUrl: string }) => request<{ project: Record<string, any> }>('/api/projects', token, { method: 'POST', body: JSON.stringify(input) }),
};
