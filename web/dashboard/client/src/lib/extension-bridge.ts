export type ExtensionConnectionState = 'unknown' | 'connected' | 'failed';

export function connectionStateFromResponse(result: unknown): ExtensionConnectionState {
  return (result as { ok?: boolean } | null)?.ok ? 'connected' : 'failed';
}

export function locateSucceeded(result: unknown) {
  const response = result as { ok?: boolean; located?: boolean } | null;
  return Boolean(response?.ok && response.located);
}
