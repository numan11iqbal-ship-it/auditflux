/**
 * Server-side tests. Run against the real Express app on a real socket
 * (supertest-free — plain http requests) so the security-critical claim,
 * "the key never leaves this process," is verified against actual HTTP
 * responses and actual console output, not mocked.
 */
process.env.PAGESPEED_API_KEY = 'FAKE_TEST_KEY_abc123XYZ';
process.env.PORT = '0'; // ephemeral port
process.env.LOG_REQUESTS = 'true';
process.env.RATE_LIMIT_PER_MINUTE = '3';

const http = require('http');

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
const checkTrue = (l, a) => check(l, !!a, true);

// Capture everything written to stdout/stderr so we can prove the key is
// never printed, under any code path, including errors.
const consoleBuffer = [];
const origLog = console.log, origErr = console.error;
console.log = (...a) => { consoleBuffer.push(a.join(' ')); origLog(...a); };
console.error = (...a) => { consoleBuffer.push(a.join(' ')); origErr(...a); };

const { config, redact } = require('../src/config');
const { makeCache } = require('../src/cache');
const { makeInflight, makeRateLimiter } = require('../src/guard');

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({ status: res.statusCode, body, json });
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log('\n=== Config and redaction ===');
  check('key read from process.env', config.pagespeedApiKey, 'FAKE_TEST_KEY_abc123XYZ');
  check('pagespeedConfigured reflects the key', config.pagespeedConfigured, true);
  check('redact() removes the exact key', redact('url?key=FAKE_TEST_KEY_abc123XYZ&x=1').includes('FAKE_TEST_KEY_abc123XYZ'), false);
  check('redact() replaces it with a marker', redact('key=FAKE_TEST_KEY_abc123XYZ').includes('[REDACTED]'), true);
  const googleKeyShapeFixture = 'AIza' + 'SyD-1234567890abcdefghijklmnopqrstuv';
  check('redact() catches the general Google key shape', redact(googleKeyShapeFixture).includes('[REDACTED]'), true);
  checkTrue('redact() handles objects', redact({ url: 'https://x?key=FAKE_TEST_KEY_abc123XYZ' }).includes('[REDACTED]'));

  console.log('\n=== Cache ===');
  {
    const cache = makeCache(1000);
    check('empty cache misses', cache.get('https://a.com/', 'mobile'), null);
    cache.set('https://a.com/', 'mobile', { ok: true, scores: { performance: 90 } });
    checkTrue('cache hit after set', !!cache.get('https://a.com/', 'mobile'));
    check('different strategy is a separate entry', cache.get('https://a.com/', 'desktop'), null);
    check('fragment does not change the cache key',
      !!cache.get('https://a.com/#x', 'mobile'), true);

    const shortCache = makeCache(10);
    shortCache.set('https://b.com/', 'mobile', { ok: true });
    await new Promise(r => setTimeout(r, 30));
    check('expired entries are evicted', shortCache.get('https://b.com/', 'mobile'), null);
  }

  console.log('\n=== Deduplication ===');
  {
    const inflight = makeInflight();
    let calls = 0;
    const factory = () => new Promise(resolve => setTimeout(() => { calls++; resolve('done'); }, 20));
    const k = inflight.key('https://a.com/', 'mobile');
    const first = inflight.join(k, factory);
    const second = inflight.join(k, factory);
    check('second join is marked deduped', second.deduped, true);
    check('first join is not marked deduped', first.deduped, false);
    await Promise.all([first.promise, second.promise]);
    check('factory only actually ran once', calls, 1);
  }

  console.log('\n=== Rate limiter ===');
  {
    const limiter = makeRateLimiter(2);
    check('first request allowed', limiter.check('client-a').allowed, true);
    check('second request allowed', limiter.check('client-a').allowed, true);
    const third = limiter.check('client-a');
    check('third request blocked at the limit', third.allowed, false);
    checkTrue('blocked response includes a retry hint', typeof third.retryAfterMs === 'number');
    check('a different client is independent', limiter.check('client-b').allowed, true);
  }

  console.log('\n=== Live HTTP: status endpoint never reveals the key ===');
  const { app } = require('../src/index.js');
  const server = app.listen(0);
  const port = server.address().port;

  const status = await get(port, '/api/status');
  check('status endpoint responds', status.status, 200);
  check('reports configured without the key', status.json.pagespeed.configured, true);
  check('response body does not contain the key', status.body.includes('FAKE_TEST_KEY_abc123XYZ'), false);

  console.log('\n=== Live HTTP: input validation ===');
  const badUrl = await get(port, '/api/pagespeed?url=not-a-url&strategy=mobile');
  check('rejects an invalid URL', badUrl.status, 400);
  check('invalid URL error code', badUrl.json.error, 'INVALID_URL');

  const badStrategy = await get(port, '/api/pagespeed?url=' + encodeURIComponent('https://example.com/') + '&strategy=laptop');
  check('rejects an invalid strategy', badStrategy.status, 400);
  check('invalid strategy error code', badStrategy.json.error, 'INVALID_STRATEGY');

  console.log('\n=== Live HTTP: real request never leaks the key, even on network failure ===');
  // No network route to googleapis.com in this sandbox, so the upstream fetch
  // will fail — which is exactly the path most likely to accidentally log a
  // request URL containing the key. That makes it the right path to test.
  const real = await get(port, '/api/pagespeed?url=' + encodeURIComponent('https://example.com/') + '&strategy=mobile');
  checkTrue('a result is returned even though upstream is unreachable here', !!real.json);
  check('failure is reported honestly, not as fake success', real.json.ok, false);
  check('response body never contains the key', real.body.includes('FAKE_TEST_KEY_abc123XYZ'), false);
  checkTrue('console output never contains the key, across all requests so far',
    !consoleBuffer.some(line => line.includes('FAKE_TEST_KEY_abc123XYZ')));

  console.log('\n=== Live HTTP: missing key is an honest state, not fake data ===');
  delete process.env.PAGESPEED_API_KEY;
  delete require.cache[require.resolve('../src/config')];
  delete require.cache[require.resolve('../src/index.js')];
  const { app: app2 } = require('../src/index.js');
  const server2 = app2.listen(0);
  const port2 = server2.address().port;

  const status2 = await get(port2, '/api/status');
  check('status reports not configured', status2.json.pagespeed.configured, false);

  const missing = await get(port2, '/api/pagespeed?url=' + encodeURIComponent('https://example.com/') + '&strategy=mobile');
  check('missing key returns 503, not fake data', missing.status, 503);
  check('missing key error code', missing.json.error, 'NOT_CONFIGURED');
  checkTrue('missing key message explains how to fix it', missing.json.message.includes('PAGESPEED_API_KEY'));
  check('no scores field is fabricated', missing.json.scores, undefined);

  server.close(); server2.close();
  console.log = origLog; console.error = origErr;

  console.log('\n---------------------------------------');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
