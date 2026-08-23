export type ExtensionConnectionState = 'unknown' | 'connected' | 'failed';

export function connectionStateFromResponse(result: unknown): ExtensionConnectionState {
  return (result as { ok?: boolean } | null)?.ok ? 'connected' : 'failed';
}

export function locateSucceeded(result: unknown) {
  const response = result as { ok?: boolean; located?: boolean } | null;
  return Boolean(response?.ok && response.located);
}

export function overlayToggled(result: unknown) {
  const response = result as { ok?: boolean; enabled?: unknown } | null;
  return Boolean(response?.ok && typeof response.enabled === 'boolean');
}

export function rescanSucceeded(result: unknown) {
  const response = result as { ok?: boolean; auditId?: unknown } | null;
  return Boolean(response?.ok && typeof response.auditId === 'string' && response.auditId);
}
