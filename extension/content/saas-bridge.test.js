const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function bridgeHarness() {
  const listeners = []; const runtimeMessages = []; const replies = []; let runtimeListener;
  const window = {
    location: { origin: 'https://auditflux.vercel.app' },
    addEventListener: (type, listener) => { if (type === 'message') listeners.push(listener); },
    postMessage: message => replies.push(message),
  };
  const chrome = { runtime: { sendMessage: message => { runtimeMessages.push(message); return Promise.resolve({ ok: true, state: 'connected' }); }, onMessage: { addListener: listener => { runtimeListener = listener; } } } };
  const source = fs.readFileSync(path.join(__dirname, 'saas-bridge.js'), 'utf8');
  vm.runInNewContext(source, { window, chrome, Set, Promise });
  return { listeners, runtimeMessages, replies, window, runtimeListener };
}

test('relays a pairing nonce only from the canonical AuditFlux SaaS origin', async () => {
  const { listeners, runtimeMessages, replies, window } = bridgeHarness();
  const relay = listeners[0];
  relay({ source: window, origin: 'https://auditflux.vercel.app', data: { type: 'auditflux:pair-request', requestId: 'request-1', nonce: 'af_conn_nonce' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(runtimeMessages), JSON.stringify([{ type: 'auditflux:pair', nonce: 'af_conn_nonce', apiBase: 'https://auditflux.vercel.app' }]));
  assert.equal(replies[0].state, 'connected');
});

test('rejects lookalike, preview, and cross-window bridge messages', () => {
  const { listeners, runtimeMessages, window } = bridgeHarness();
  const relay = listeners[0];
  const payload = { type: 'auditflux:pair-request', requestId: 'request-1', nonce: 'af_conn_nonce' };
  relay({ source: window, origin: 'https://auditflux-numi4.vercel.app', data: payload });
  relay({ source: {}, origin: 'https://auditflux.vercel.app', data: payload });
  relay({ source: window, origin: 'https://auditflux-vercel.app', data: payload });
  assert.equal(runtimeMessages.length, 0);
});
