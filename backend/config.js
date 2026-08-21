/**
 * AuditFlux SEO backend — configuration.
 *
 * This is the ONLY module in the whole project allowed to read
 * process.env.PAGESPEED_API_KEY. Every other module receives the key already
 * bound into a function closure, or does not receive it at all.
 *
 * The key is never:
 *   - logged (see redact() below, used everywhere a request/error is logged)
 *   - included in any HTTP response body sent to the extension
 *   - written to disk, to a cache file, or to the response cache (cache.js
 *     stores only the already-parsed, key-free PageSpeed result)
 */
require('dotenv').config();

function readBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return /^(1|true|yes)$/i.test(v.trim());
}

const config = {
  port: Number(process.env.PORT) || 8787,

  pagespeedApiKey: process.env.PAGESPEED_API_KEY || null,
  pagespeedBaseUrl: process.env.PAGESPEED_API_BASE_URL ||
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',

  cruxApiKey: process.env.CRUX_API_KEY || null,

  cacheTtlMs: Number(process.env.PAGESPEED_CACHE_TTL_MS) || 30 * 60 * 1000,
  requestTimeoutMs: Number(process.env.PAGESPEED_TIMEOUT_MS) || 30000,

  // Restrict which origins may call this proxy at all. In production this
  // should be the extension's own origin(s), not '*'.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*')
    .split(',').map(s => s.trim()).filter(Boolean),

  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE) || 20,

  logRequests: readBool('LOG_REQUESTS', true)
};

/** True only when a real-looking key is configured — never logs the key itself. */
config.pagespeedConfigured = !!config.pagespeedApiKey;
config.cruxConfigured = !!config.cruxApiKey;

/**
 * Strips anything that looks like a Google API key from a string before it is
 * ever logged. Used on every console.log/error call in this service.
 */
function redact(input) {
  let s = typeof input === 'string' ? input : JSON.stringify(input);
  if (config.pagespeedApiKey) s = s.split(config.pagespeedApiKey).join('[REDACTED]');
  if (config.cruxApiKey) s = s.split(config.cruxApiKey).join('[REDACTED]');
  // Also catch the general shape of a Google API key, in case a different one
  // ever ends up in a log line (e.g. from an upstream error message).
  s = s.replace(/AIza[0-9A-Za-z\-_]{35}/g, '[REDACTED]');
  s = s.replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]');
  return s;
}

function safeLog(...parts) {
  if (!config.logRequests) return;
  // eslint-disable-next-line no-console
  console.log(...parts.map(redact));
}

function safeError(...parts) {
  // eslint-disable-next-line no-console
  console.error(...parts.map(redact));
}

module.exports = { config, redact, safeLog, safeError };
