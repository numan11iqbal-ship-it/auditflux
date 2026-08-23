/* AuditFlux SaaS bridge: relays a deliberately narrow, official-origin-only pairing protocol. */
const AUDITFLUX_SAAS_ORIGINS = new Set([
  'https://auditflux.vercel.app',
]);

function bridgeReply(requestId, response) {
  window.postMessage({ type: 'auditflux:bridge-result', requestId, ...response }, window.location.origin);
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== window.location.origin || !AUDITFLUX_SAAS_ORIGINS.has(event.origin)) return;
  const message = event.data;
  if (!message || typeof message !== 'object' || typeof message.requestId !== 'string') return;
  if (!['auditflux:pair-request', 'auditflux:connection-status', 'auditflux:disconnect-request', 'auditflux:extension-command'].includes(message.type)) return;
  const type = message.type === 'auditflux:pair-request' ? 'auditflux:pair' : message.type === 'auditflux:connection-status' ? 'auditflux:connection-status' : message.type === 'auditflux:disconnect-request' ? 'auditflux:disconnect' : 'auditflux:command';
  chrome.runtime.sendMessage({ type, nonce: message.nonce, command: message.command, apiBase: event.origin }).then(response => bridgeReply(message.requestId, response)).catch(() => bridgeReply(message.requestId, { ok: false, reason: 'CONNECTION_FAILED' }));
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type !== 'auditflux:workspace-event' || typeof message.eventType !== 'string') return;
  window.postMessage({ type: 'auditflux:workspace-event', eventType: message.eventType, payload: message.payload || {} }, window.location.origin);
});
