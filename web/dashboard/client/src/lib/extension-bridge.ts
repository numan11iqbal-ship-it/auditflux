export type ExtensionConnectionState = 'unknown' | 'connecting' | 'connected' | 'not_connected' | 'expired' | 'failed';
type BridgeResponse = { ok?: boolean; state?: ExtensionConnectionState; reason?: string; connection?: Record<string, unknown>; auditId?: string; enabled?: boolean; located?: boolean; duplicate?: boolean; error?: string };

function requestId() { return `af_web_${crypto.randomUUID()}`; }

export function bridgeRequest(type: 'auditflux:pair-request' | 'auditflux:connection-status' | 'auditflux:disconnect-request' | 'auditflux:extension-command', payload: Record<string, unknown> = {}): Promise<BridgeResponse> {
  return new Promise(resolve => {
    const id = requestId(); const timeout = window.setTimeout(() => finish({ ok: false, reason: 'EXTENSION_NOT_DETECTED' }), 5000);
    const listener = (event: MessageEvent) => { if (event.source === window && event.origin === window.location.origin && event.data?.type === 'auditflux:bridge-result' && event.data?.requestId === id) finish(event.data); };
    const finish = (response: BridgeResponse) => { window.clearTimeout(timeout); window.removeEventListener('message', listener); resolve(response); };
    window.addEventListener('message', listener);
    window.postMessage({ type, requestId: id, ...payload }, window.location.origin);
  });
}

async function pairingApi(token: string, body?: Record<string, unknown>, method: 'GET' | 'POST' = 'POST') {
  const response = await fetch('/api/extensions', { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'AuditFlux extension connection is unavailable.'); return data;
}

export async function connectExtension(token: string) { const challenge = await pairingApi(token, { action: 'challenge' }); return bridgeRequest('auditflux:pair-request', { nonce: challenge.nonce }); }
export async function extensionStatus() { return bridgeRequest('auditflux:connection-status'); }
export async function disconnectExtension(token: string, connectionId?: string) { if (connectionId) await pairingApi(token, { action: 'disconnect', connectionId }); return bridgeRequest('auditflux:disconnect-request'); }
export async function connectedBrowsers(token: string) { const data = await pairingApi(token, undefined, 'GET'); return Array.isArray(data.connections) ? data.connections as Record<string, unknown>[] : []; }
export async function extensionCommand(command: Record<string, unknown>) { return bridgeRequest('auditflux:extension-command', { command }); }

export type WorkspaceBridgeEvent = { eventType: 'AUDITFLUX_EXTENSION_CONNECTED' | 'AUDITFLUX_AUDIT_SAVED' | 'AUDITFLUX_AUDIT_UPDATED' | 'AUDITFLUX_EXTENSION_DISCONNECTED'; payload: Record<string, unknown> };

export function subscribeWorkspaceEvents(listener: (event: WorkspaceBridgeEvent) => void) {
  const receive = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== 'auditflux:workspace-event') return;
    if (!['AUDITFLUX_EXTENSION_CONNECTED', 'AUDITFLUX_AUDIT_SAVED', 'AUDITFLUX_AUDIT_UPDATED', 'AUDITFLUX_EXTENSION_DISCONNECTED'].includes(event.data.eventType)) return;
    listener({ eventType: event.data.eventType, payload: event.data.payload && typeof event.data.payload === 'object' ? event.data.payload : {} });
  };
  window.addEventListener('message', receive);
  return () => window.removeEventListener('message', receive);
}

export function connectionStateFromResponse(result: unknown): ExtensionConnectionState { const response = result as BridgeResponse | null; return response?.ok ? response.state === 'not_connected' || response.state === 'expired' ? response.state : 'connected' : 'failed'; }
export function locateSucceeded(result: unknown) { const response = result as BridgeResponse | null; return Boolean(response?.ok && response.located); }
export function overlayToggled(result: unknown) { const response = result as BridgeResponse | null; return Boolean(response?.ok && typeof response.enabled === 'boolean'); }
export function rescanSucceeded(result: unknown) { const response = result as BridgeResponse | null; return Boolean(response?.ok && typeof response.auditId === 'string' && response.auditId); }
