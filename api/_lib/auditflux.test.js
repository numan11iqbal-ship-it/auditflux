const test = require('node:test');
const assert = require('node:assert/strict');
const { safeHttpUrl, hostName } = require('./auditflux');

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
