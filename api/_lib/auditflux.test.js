const test = require('node:test');
const assert = require('node:assert/strict');
const { safeHttpUrl, hostName, publicRuntimeStatus, supabaseServerConfig, extensionSessionIdentityFor } = require('./auditflux');

test('accepts publicly routable http URLs and normalizes their host name', () => {
  const url = safeHttpUrl('https://www.example.com/path?q=1');
  assert.equal(url.href, 'https://www.example.com/path?q=1');
  assert.equal(hostName(url.href), 'example.com');
});

test('rejects non-http, local, and private network targets', () => {
  ['file:///etc/passwd', 'http://localhost:3000', 'http://127.0.0.1', 'http://10.0.0.1', 'http://192.168.1.1'].forEach(value => {
    assert.equal(safeHttpUrl(value), null);
  });
});

test('public runtime status reveals configuration state and server host without exposing service credentials', () => {
  const original = {
    url: process.env.SUPABASE_URL,
    role: process.env.SUPABASE_SERVICE_ROLE_KEY,
    auditfluxUrl: process.env.AUDITFLUX_SUPABASE_URL,
    auditfluxRole: process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY,
    pagespeed: process.env.PAGESPEED_API_KEY,
    crux: process.env.CRUX_API_KEY,
  };
  process.env.SUPABASE_URL = 'https://tvcvkpowxhcqgwbmzkdo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret-must-not-leak';
  delete process.env.AUDITFLUX_SUPABASE_URL;
  delete process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY;
  process.env.PAGESPEED_API_KEY = 'pagespeed-secret-must-not-leak';
  process.env.CRUX_API_KEY = 'crux-secret-must-not-leak';
  try {
    const status = publicRuntimeStatus();
    assert.deepEqual(status, {
      supabase: { configured: true, host: 'tvcvkpowxhcqgwbmzkdo.supabase.co', source: 'integration' },
      pagespeed: { configured: true },
      crux: { configured: true },
    });
    assert.equal(JSON.stringify(status).includes('secret-must-not-leak'), false);
  } finally {
    if (original.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = original.url;
    if (original.role === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = original.role;
    if (original.auditfluxUrl === undefined) delete process.env.AUDITFLUX_SUPABASE_URL; else process.env.AUDITFLUX_SUPABASE_URL = original.auditfluxUrl;
    if (original.auditfluxRole === undefined) delete process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY; else process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY = original.auditfluxRole;
    if (original.pagespeed === undefined) delete process.env.PAGESPEED_API_KEY; else process.env.PAGESPEED_API_KEY = original.pagespeed;
    if (original.crux === undefined) delete process.env.CRUX_API_KEY; else process.env.CRUX_API_KEY = original.crux;
  }
});

test('dedicated AuditFlux Supabase configuration overrides integration-managed values', () => {
  const original = {
    url: process.env.SUPABASE_URL,
    role: process.env.SUPABASE_SERVICE_ROLE_KEY,
    auditfluxUrl: process.env.AUDITFLUX_SUPABASE_URL,
    auditfluxRole: process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'https://unrelated.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'integration-secret';
  process.env.AUDITFLUX_SUPABASE_URL = 'https://tvcvkpowxhcqgwbmzkdo.supabase.co';
  process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY = 'auditflux-secret';
  try {
    assert.deepEqual(supabaseServerConfig(), {
      url: 'https://tvcvkpowxhcqgwbmzkdo.supabase.co',
      serviceRoleKey: 'auditflux-secret',
      source: 'auditflux',
    });
    assert.deepEqual(publicRuntimeStatus().supabase, {
      configured: true,
      host: 'tvcvkpowxhcqgwbmzkdo.supabase.co',
      source: 'auditflux',
    });
  } finally {
    if (original.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = original.url;
    if (original.role === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = original.role;
    if (original.auditfluxUrl === undefined) delete process.env.AUDITFLUX_SUPABASE_URL; else process.env.AUDITFLUX_SUPABASE_URL = original.auditfluxUrl;
    if (original.auditfluxRole === undefined) delete process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY; else process.env.AUDITFLUX_SUPABASE_SERVICE_ROLE_KEY = original.auditfluxRole;
  }
});

test('extension sessions identify only connected, unexpired, and unrevoked browser installations', async () => {
  const now = '2026-08-23T12:00:00.000Z'; const writes = [];
  const query = response => ({ select: () => query(response), eq: () => query(response), maybeSingle: async () => response, update: value => { writes.push(value); return query({ data: null, error: null }); } });
  const activeDb = { from: table => table === 'extension_sessions' ? query({ data: { id: 'session-1', connection_id: 'connection-1', expires_at: '2026-08-23T13:00:00.000Z', revoked_at: null }, error: null }) : query({ data: { id: 'connection-1', user_id: 'user-1', workspace_id: 'workspace-1', status: 'connected' }, error: null }) };
  const identity = await extensionSessionIdentityFor(activeDb, 'short-lived-token', now);
  assert.equal(identity.user.id, 'user-1'); assert.equal(identity.extensionConnection.workspace_id, 'workspace-1'); assert.equal(writes.length, 2);
  const expiredDb = { from: () => query({ data: { id: 'session-1', connection_id: 'connection-1', expires_at: '2026-08-23T11:59:59.000Z', revoked_at: null }, error: null }) };
  await assert.rejects(() => extensionSessionIdentityFor(expiredDb, 'short-lived-token', now), error => error.status === 401);
  const revokedDb = { from: () => query({ data: { id: 'session-1', connection_id: 'connection-1', expires_at: '2026-08-23T13:00:00.000Z', revoked_at: now }, error: null }) };
  await assert.rejects(() => extensionSessionIdentityFor(revokedDb, 'short-lived-token', now), error => error.status === 401);
});
