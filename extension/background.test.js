const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('accepts a dashboard-originated external connection message and stores the session bridge', async () => {
  const listeners = {};
  let storedConnection = null;
  const chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      session: { set: async value => { storedConnection = value.auditfluxConnection; } },
    },
    runtime: {
      onMessage: { addListener: listener => { listeners.internal = listener; } },
      onMessageExternal: { addListener: listener => { listeners.external = listener; } },
    },
    tabs: {},
    scripting: {},
    windows: {},
  };
  const source = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  vm.runInNewContext(source, { chrome, importScripts: () => {}, Date, URL });

  let response;
  const returned = listeners.external(
    { type: 'auditflux:connection', apiBase: 'https://auditflux.vercel.app', accessToken: 'test-token' },
    { origin: 'https://auditflux.vercel.app' },
    value => { response = value; },
  );
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(returned, true);
  assert.equal(response.ok, true);
  assert.equal(storedConnection.apiBase, 'https://auditflux.vercel.app');
  assert.equal(storedConnection.accessToken, 'test-token');
  assert.equal(typeof storedConnection.connectedAt, 'number');
});

test('toggles the existing heading overlay on the exact registered audited tab for the unified SaaS workspace', async () => {
  const listeners = {};
  const registry = { 'audit-123': { tabId: 7, windowId: 2, url: 'https://example.com/article', savedAt: Date.now() } };
  let executed = null;
  const chrome = {
    storage: { local: { get: async () => ({ auditfluxAuditTabRegistry: registry }), set: async () => {} }, session: { set: async () => {} } },
    runtime: { onMessage: { addListener: listener => { listeners.internal = listener; } }, onMessageExternal: { addListener: listener => { listeners.external = listener; } } },
    tabs: { get: async () => ({ id: 7, url: 'https://example.com/article' }), update: async () => {} },
    windows: { update: async () => {} },
    scripting: { executeScript: async options => { executed = options; return [{ result: { enabled: true, count: 6 } }]; } },
  };
  const source = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  vm.runInNewContext(source, { chrome, importScripts: () => {}, Date, URL, SCC_TOGGLE_HEADING_OVERLAY: () => ({ enabled: true, count: 6 }), SCC_LOCATE_AUDIT_TARGET: () => ({ located: true }) });

  let response;
  const returned = listeners.external({ type: 'auditflux:toggle-heading-overlay', auditId: 'audit-123' }, { origin: 'https://auditflux.vercel.app' }, value => { response = value; });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(returned, true);
  assert.equal(executed.target.tabId, 7);
  assert.equal(response.ok, true);
  assert.equal(response.enabled, true);
  assert.equal(response.count, 6);
});

test('re-scans the registered tab and persists a new normalized audit rather than overwriting the current audit', async () => {
  const listeners = {}; const registry = { 'audit-old': { tabId: 7, windowId: 2, url: 'https://example.com/article', savedAt: Date.now() } }; let stored = null;
  const chrome = {
    storage: { local: { get: async () => ({ auditfluxAuditTabRegistry: registry }), set: async value => { stored = value; } }, session: { get: async () => ({ auditfluxConnection: { apiBase: 'https://auditflux.vercel.app', accessToken: 'token' } }), set: async () => {} } },
    runtime: { onMessage: { addListener: listener => { listeners.internal = listener; } }, onMessageExternal: { addListener: listener => { listeners.external = listener; } } },
    tabs: { get: async () => ({ id: 7, url: 'https://example.com/article' }), update: async () => {} }, windows: { update: async () => {} },
    scripting: { executeScript: async options => options.func.name === 'SCC_ANALYZE' ? [{ result: { page: { url: 'https://example.com/article' } } }] : [{ result: null }] },
  };
  const source = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  vm.runInNewContext(source, { chrome, importScripts: () => {}, Date, URL, fetch: async () => ({ ok: true, json: async () => ({ auditId: 'audit-new', duplicate: false }) }), SCC_ANALYZE: async () => ({}), SCC_AUDIT: () => ({ overall: 91 }), AUDITFLUX_CONTRACT: { normalizeAudit: () => ({ clientAuditId: 'client-new' }) }, SCC_TOGGLE_HEADING_OVERLAY: () => ({}), SCC_LOCATE_AUDIT_TARGET: () => ({}) });
  let response; listeners.external({ type: 'auditflux:rescan', auditId: 'audit-old' }, { origin: 'https://auditflux.vercel.app' }, value => { response = value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(response.ok, true);
  assert.equal(response.auditId, 'audit-new');
  assert.equal(stored.sccLatestSavedAudit.auditId, 'audit-new');
});
