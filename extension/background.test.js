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
