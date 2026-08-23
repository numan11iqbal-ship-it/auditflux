const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const auditfluxPath = require.resolve('./auditflux');
const extensionsPath = require.resolve('./extensions');

function loadExtensions({ challenge, connections = [], sessions = [] } = {}) {
  const state = { challenge, connections, sessions, revokedConnectionIds: [], users: [] };
  const chain = (response, onEq) => ({
    error: response?.error || null,
    eq(...args) { onEq?.(...args); return this; },
    is(...args) { onEq?.(...args); return this; },
    order() { return this; },
    limit() { return this; },
    select() { return this; },
    async maybeSingle() { return response; },
    async single() { return response; },
  });
  const db = {
    from(table) {
      if (table === 'extension_pairing_challenges') return {
        select: () => chain({ data: state.challenge, error: null }),
        insert: async payload => { state.challenge = { id: 'challenge-1', status: 'pending', consumed_at: null, ...payload }; return { error: null }; },
        update: payload => chain({ data: state.challenge?.status === 'pending' && !state.challenge?.consumed_at ? { id: state.challenge.id } : null, error: null }, () => { if (state.challenge?.status === 'pending' && !state.challenge?.consumed_at) Object.assign(state.challenge, payload); }),
      };
      if (table === 'extension_connections') return {
        upsert: payload => ({ select: () => ({ single: async () => { const connection = { id: 'connection-1', status: 'connected', extension_version: payload.extension_version, capabilities: payload.capabilities, last_seen_at: payload.last_seen_at, ...payload }; state.connections.push(connection); return { data: connection, error: null }; } }) }),
        select: () => chain({ data: state.connections[0] || null, error: null }),
        update: payload => { state.revokedConnectionIds.push(payload); return chain({ data: null, error: null }); },
      };
      if (table === 'extension_sessions') return {
        insert: async payload => { state.sessions.push(payload); return { error: null }; },
        update: payload => { state.revokedConnectionIds.push(payload); return chain({ data: null, error: null }); },
      };
      throw new Error(`Unexpected table ${table}`);
    },
  };
  delete require.cache[auditfluxPath]; delete require.cache[extensionsPath];
  require.cache[auditfluxPath] = { id: auditfluxPath, filename: auditfluxPath, loaded: true, exports: {
    adminClient: () => db,
    extensionSessionHash: value => crypto.createHash('sha256').update(String(value)).digest('hex'),
    extensionSessionIdentity: async () => ({ db, user: { id: 'user-1' } }),
    parseBody: request => request.body || {},
    requireUser: async () => ({ db, user: { id: 'user-1' } }),
    workspaceFor: async () => 'workspace-1',
  } };
  return { extensions: require('./extensions'), state };
}

test('accepts a one-time valid pairing challenge and refuses its replay', async () => {
  const nonce = 'af_conn_nonce-for-replay-test-123456';
  const { extensions, state } = loadExtensions({ challenge: { id: 'challenge-1', workspace_id: 'workspace-1', user_id: 'user-1', nonce_hash: crypto.createHash('sha256').update(nonce).digest('hex'), status: 'pending', consumed_at: null, expires_at: new Date(Date.now() + 60_000).toISOString() } });
  const result = await extensions.confirmChallenge({ body: { nonce, installationId: 'installation-id-123456', extensionVersion: '5.5.0', capabilities: ['audit:save'] } });
  assert.equal(result.connection.status, 'connected');
  assert.equal(state.sessions.length, 1);
  assert.equal(state.challenge.status, 'connected');
  await assert.rejects(() => extensions.confirmChallenge({ body: { nonce, installationId: 'installation-id-123456' } }), error => error.status === 410);
  assert.equal(state.sessions.length, 1);
});

test('refuses expired or malformed extension pairing confirmations', async () => {
  const nonce = 'af_conn_expired-nonce-1234567890';
  const { extensions } = loadExtensions({ challenge: { id: 'challenge-1', workspace_id: 'workspace-1', user_id: 'user-1', nonce_hash: crypto.createHash('sha256').update(nonce).digest('hex'), status: 'pending', consumed_at: null, expires_at: new Date(Date.now() - 1_000).toISOString() } });
  await assert.rejects(() => extensions.confirmChallenge({ body: { nonce, installationId: 'installation-id-123456' } }), error => error.status === 410);
  await assert.rejects(() => extensions.confirmChallenge({ body: { nonce: 'not-a-pairing-nonce', installationId: 'short' } }), error => error.status === 400);
});

test('disconnect revokes all active sessions for the authenticated owner connection', async () => {
  const { extensions, state } = loadExtensions({ connections: [{ id: 'connection-1', workspace_id: 'workspace-1', user_id: 'user-1', status: 'connected' }] });
  const result = await extensions.disconnect({ headers: { authorization: 'Bearer browser-session' }, body: { connectionId: 'connection-1' } });
  assert.deepEqual(result, { disconnected: true });
  assert.equal(state.revokedConnectionIds.length, 2);
});

test('a paired extension can revoke only its own connection without a browser bearer token', async () => {
  const { extensions, state } = loadExtensions({ connections: [{ id: 'connection-1', workspace_id: 'workspace-1', user_id: 'user-1', status: 'connected' }] });
  const result = await extensions.disconnect({ headers: { 'x-auditflux-extension-session': 'short-session' }, body: { connectionId: 'attempted-other-connection' } });
  assert.deepEqual(result, { disconnected: true });
  assert.equal(state.revokedConnectionIds.length, 2);
});
