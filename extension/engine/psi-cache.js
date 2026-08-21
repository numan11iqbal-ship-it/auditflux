/**
 * AuditFlux SEO — PageSpeed request cache and deduplication.
 *
 * Two problems this solves:
 *
 *  1. Quota. A PageSpeed run is expensive and rate-limited. Switching between
 *     Mobile and Desktop, re-rendering a view, or reopening the report must not
 *     spend another request. Only an explicit "Run PageSpeed" does.
 *  2. Double-firing. Two clicks, or a click plus a re-render, must not put two
 *     identical requests in flight.
 *
 * The usage counter is incremented by the caller only when a request actually
 * reached Google and succeeded — never for a cache hit, and never for a failure
 * that never left the browser.
 */

const SCC_PSI_CACHE_KEY = 'sccPsiCache';
const SCC_PSI_CACHE_TTL_MS = 30 * 60 * 1000;   // 30 minutes
const SCC_PSI_CACHE_MAX = 20;                  // keep storage small

/** Cache identity: same URL + same strategy + same key configuration. */
function sccPsiCacheKey(url, strategy, hasApiKey) {
  let normalized = url;
  try {
    const u = new URL(url);
    u.hash = '';
    normalized = u.href;
  } catch (e) { /* fall back to the raw string */ }
  return `${normalized}::${strategy}::${hasApiKey ? 'keyed' : 'anon'}`;
}

const SCC_PSI_CACHE = {
  async read(storage, url, strategy, hasApiKey) {
    if (!storage) return null;
    try {
      const got = await storage.get(SCC_PSI_CACHE_KEY);
      const all = got[SCC_PSI_CACHE_KEY] || {};
      const hit = all[sccPsiCacheKey(url, strategy, hasApiKey)];
      if (!hit) return null;
      const age = Date.now() - hit.storedAt;
      if (age > SCC_PSI_CACHE_TTL_MS) return null;
      return { result: hit.result, ageMs: age, storedAt: hit.storedAt };
    } catch (e) { return null; }
  },

  async write(storage, url, strategy, hasApiKey, result) {
    if (!storage) return;
    try {
      const got = await storage.get(SCC_PSI_CACHE_KEY);
      const all = got[SCC_PSI_CACHE_KEY] || {};
      all[sccPsiCacheKey(url, strategy, hasApiKey)] = { storedAt: Date.now(), result };

      // Evict oldest entries rather than letting the cache grow without bound.
      const keys = Object.keys(all);
      if (keys.length > SCC_PSI_CACHE_MAX) {
        keys.sort((a, b) => all[a].storedAt - all[b].storedAt)
          .slice(0, keys.length - SCC_PSI_CACHE_MAX)
          .forEach(k => delete all[k]);
      }
      await storage.set({ [SCC_PSI_CACHE_KEY]: all });
    } catch (e) { /* caching is best-effort */ }
  },

  async clear(storage) {
    try { await storage.set({ [SCC_PSI_CACHE_KEY]: {} }); } catch (e) {}
  }
};

/** Promises for requests currently in flight, keyed identically to the cache. */
const SCC_PSI_INFLIGHT = new Map();

function sccIsPageSpeedRunning(url, strategy, hasApiKey) {
  return SCC_PSI_INFLIGHT.has(sccPsiCacheKey(url, strategy, hasApiKey));
}

/**
 * Returns { result, fromCache, ageMs, deduped, spentRequest }.
 *
 * `spentRequest` is the only signal the caller should use to increment the
 * usage counter: it is true only when this call actually hit Google.
 */
async function sccGetPageSpeed(options) {
  const {
    url, strategy, apiKey = null, storage = null,
    force = false, runner = null
  } = options;

  const hasKey = !!apiKey;
  const key = sccPsiCacheKey(url, strategy, hasKey);

  if (!force) {
    const cached = await SCC_PSI_CACHE.read(storage, url, strategy, hasKey);
    if (cached) {
      return {
        result: cached.result, fromCache: true, ageMs: cached.ageMs,
        deduped: false, spentRequest: false
      };
    }
  }

  // Join an identical request already in flight instead of starting another.
  if (SCC_PSI_INFLIGHT.has(key)) {
    const result = await SCC_PSI_INFLIGHT.get(key);
    return { result, fromCache: false, ageMs: 0, deduped: true, spentRequest: false };
  }

  const call = (runner || sccRunPageSpeed)(url, strategy, apiKey);
  SCC_PSI_INFLIGHT.set(key, call);

  let result;
  try {
    result = await call;
  } finally {
    SCC_PSI_INFLIGHT.delete(key);
  }

  // Only successful responses are worth caching; errors should be retryable.
  if (result && result.ok) {
    await SCC_PSI_CACHE.write(storage, url, strategy, hasKey, result);
  }

  return {
    result,
    fromCache: false,
    ageMs: 0,
    deduped: false,
    // A request that never reached Google (no permission, network failure)
    // must not count against the user's quota.
    spentRequest: !!(result && result.error !== 'NO_PERMISSION' && result.error !== 'NETWORK')
  };
}

/** "5 minutes ago" style label for the cached badge. */
function sccFormatAge(ms) {
  if (ms === null || ms === undefined) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return s <= 5 ? 'just now' : s + ' seconds ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.round(m / 60);
  return h + (h === 1 ? ' hour ago' : ' hours ago');
}

if (typeof module !== 'undefined') {
  module.exports = {
    SCC_PSI_CACHE, SCC_PSI_CACHE_TTL_MS, sccPsiCacheKey,
    sccGetPageSpeed, sccIsPageSpeedRunning, sccFormatAge, SCC_PSI_INFLIGHT
  };
}
