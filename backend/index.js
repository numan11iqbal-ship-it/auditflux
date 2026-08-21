/**
 * AuditFlux SEO backend proxy.
 *
 * Purpose: the Chrome extension is a static, fully-inspectable ZIP — anything
 * baked into it (including a value substituted at "build time" from an env
 * var) ships in plain text inside the package and can be read by unzipping
 * it. That makes a client-only extension structurally unable to keep a secret.
 * This tiny service exists so the real PAGESPEED_API_KEY lives only here, on
 * a machine the extension never has file access to, and the extension talks
 * to this proxy instead of talking to Google directly.
 *
 * The key is read once in config.js from process.env and never appears in:
 *   - any response body returned by this server (see routes below)
 *   - any log line (see config.js's redact()/safeLog())
 *   - the cache (only the parsed, key-free result is stored)
 */
const express = require('express');
const { config, safeLog, safeError } = require('./config');
const { makeCache } = require('./cache');
const { makeInflight, makeRateLimiter } = require('./guard');
const {
  sccParsePageSpeed, sccParseCrux
} = require('../../scc/engine/pagespeed.js');

const app = express();
app.disable('x-powered-by');

const psiCache = makeCache(config.cacheTtlMs);
const inflight = makeInflight();
const limiter = makeRateLimiter(config.rateLimitPerMinute);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (config.allowedOrigins.includes('*') || (origin && config.allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  safeLog(`${req.method} ${req.path} ${JSON.stringify(req.query)}`);
  next();
});

/**
 * Tells the extension whether the server has a key configured, without ever
 * revealing the key itself. This is how the Settings screen shows
 * "PageSpeed API is not configured" honestly instead of guessing.
 */
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    pagespeed: { configured: config.pagespeedConfigured },
    crux: { configured: config.cruxConfigured },
    cacheTtlMs: config.cacheTtlMs
  });
});

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) { return false; }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callPageSpeed(url, strategy) {
  const params = new URLSearchParams({ url, strategy });
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach(c => params.append('category', c));
  // The key is attached here, in the one function that talks to Google, and
  // is never placed anywhere it could be echoed back to a caller.
  params.set('key', config.pagespeedApiKey);

  const res = await withTimeout(fetch(`${config.pagespeedBaseUrl}?${params}`), config.requestTimeoutMs);
  const status = res.status;
  let body;
  try { body = await res.json(); } catch (e) { body = null; }

  if (status === 429) return { ok: false, error: 'RATE_LIMIT', status, message: 'Google PageSpeed rate limit reached.' };
  if (status === 400) return { ok: false, error: 'CANNOT_ANALYZE', status, message: body?.error?.message || 'Google could not analyze this URL.' };
  if (status === 403) return { ok: false, error: 'INVALID_KEY', status, message: 'The configured PageSpeed API key was rejected by Google.' };
  if (!res.ok || !body) return { ok: false, error: 'BAD_RESPONSE', status, message: body?.error?.message || 'Unexpected response from Google.' };

  return sccParsePageSpeed(body, strategy);
}

app.get('/api/pagespeed', async (req, res) => {
  const clientId = req.ip || 'unknown';
  const gate = limiter.check(clientId);
  if (!gate.allowed) {
    return res.status(429).json({
      ok: false, error: 'RATE_LIMIT',
      message: `This proxy allows ${config.rateLimitPerMinute} PageSpeed requests per minute per client.`,
      retryAfterMs: gate.retryAfterMs
    });
  }

  if (!config.pagespeedConfigured) {
    // Explicit, honest state — never fall back to fake data.
    return res.status(503).json({
      ok: false, error: 'NOT_CONFIGURED',
      message: 'PageSpeed API is not configured. Set PAGESPEED_API_KEY in the server .env file.'
    });
  }

  const { url, strategy = 'mobile' } = req.query;
  if (!url || !isValidHttpUrl(url)) {
    return res.status(400).json({ ok: false, error: 'INVALID_URL', message: 'A valid http(s) URL is required.' });
  }
  if (!['mobile', 'desktop'].includes(strategy)) {
    return res.status(400).json({ ok: false, error: 'INVALID_STRATEGY', message: 'strategy must be "mobile" or "desktop".' });
  }

  const cached = psiCache.get(url, strategy);
  if (cached) {
    return res.json({ ...cached.value, fromCache: true, ageMs: cached.ageMs });
  }

  const key = inflight.key(url, strategy);
  const { promise, deduped } = inflight.join(key, () => callPageSpeed(url, strategy));

  try {
    const result = await promise;
    if (result.ok) psiCache.set(url, strategy, result);
    res.status(result.ok ? 200 : (result.status || 502)).json({ ...result, fromCache: false, deduped });
  } catch (e) {
    const timedOut = e && e.code === 'TIMEOUT';
    safeError('PageSpeed proxy error:', e && e.message);
    res.status(timedOut ? 504 : 502).json({
      ok: false,
      error: timedOut ? 'TIMEOUT' : 'NETWORK',
      message: timedOut ? 'The request to Google timed out.' : 'Could not reach Google PageSpeed Insights.'
    });
  }
});

app.get('/api/crux', async (req, res) => {
  if (!config.cruxConfigured) {
    return res.status(503).json({ ok: false, error: 'NOT_CONFIGURED', message: 'CrUX API is not configured on this server.' });
  }
  const { url, strategy = 'mobile' } = req.query;
  if (!url || !isValidHttpUrl(url)) {
    return res.status(400).json({ ok: false, error: 'INVALID_URL', message: 'A valid http(s) URL is required.' });
  }
  const formFactor = strategy === 'desktop' ? 'DESKTOP' : 'PHONE';

  try {
    const upstream = await withTimeout(
      fetch('https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=' + encodeURIComponent(config.cruxApiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formFactor })
      }),
      config.requestTimeoutMs
    );
    if (upstream.status === 404) {
      return res.json({ ok: false, error: 'NO_DATA', message: 'Chrome UX Report does not currently have sufficient real-user data for this URL.' });
    }
    const body = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ ok: false, error: 'BAD_RESPONSE', message: body?.error?.message || 'Unexpected CrUX response.' });
    }
    res.json(sccParseCrux(body, formFactor, url));
  } catch (e) {
    const timedOut = e && e.code === 'TIMEOUT';
    safeError('CrUX proxy error:', e && e.message);
    res.status(timedOut ? 504 : 502).json({ ok: false, error: timedOut ? 'TIMEOUT' : 'NETWORK', message: 'Could not reach Chrome UX Report.' });
  }
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));

if (require.main === module) {
  app.listen(config.port, () => {
    safeLog(`AuditFlux backend listening on :${config.port} — PageSpeed configured: ${config.pagespeedConfigured}, CrUX configured: ${config.cruxConfigured}`);
  });
}

module.exports = { app };
