const test = require('node:test');
const assert = require('node:assert/strict');
const { safeHttpUrl, hostName, publicRuntimeStatus } = require('./auditflux');

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
    pagespeed: process.env.PAGESPEED_API_KEY,
    crux: process.env.CRUX_API_KEY,
  };
  process.env.SUPABASE_URL = 'https://tvcvkpowxhcqgwbmzkdo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret-must-not-leak';
  process.env.PAGESPEED_API_KEY = 'pagespeed-secret-must-not-leak';
  process.env.CRUX_API_KEY = 'crux-secret-must-not-leak';
  try {
    const status = publicRuntimeStatus();
    assert.deepEqual(status, {
      supabase: { configured: true, host: 'tvcvkpowxhcqgwbmzkdo.supabase.co' },
      pagespeed: { configured: true },
      crux: { configured: true },
    });
    assert.equal(JSON.stringify(status).includes('secret-must-not-leak'), false);
  } finally {
    if (original.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = original.url;
    if (original.role === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = original.role;
    if (original.pagespeed === undefined) delete process.env.PAGESPEED_API_KEY; else process.env.PAGESPEED_API_KEY = original.pagespeed;
    if (original.crux === undefined) delete process.env.CRUX_API_KEY; else process.env.CRUX_API_KEY = original.crux;
  }
});
