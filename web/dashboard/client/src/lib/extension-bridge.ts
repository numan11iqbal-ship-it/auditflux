export type ExtensionConnectionState = 'unknown' | 'connected' | 'failed';

export function connectionStateFromResponse(result: unknown): ExtensionConnectionState {
  return (result as { ok?: boolean } | null)?.ok ? 'connected' : 'failed';
}
