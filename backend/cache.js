function normalizeUrl(url) {
  try { const parsed = new URL(url); parsed.hash = ''; return parsed.href; } catch { return String(url); }
}

function makeCache(ttlMs) {
  const entries = new Map();
  const key = (url, strategy) => `${normalizeUrl(url)}::${strategy}`;
  return {
    get(url, strategy) {
      const entry = entries.get(key(url, strategy));
      if (!entry) return null;
      const ageMs = Date.now() - entry.createdAt;
      if (ageMs > ttlMs) { entries.delete(key(url, strategy)); return null; }
      return { value: entry.value, ageMs };
    },
    set(url, strategy, value) { entries.set(key(url, strategy), { value, createdAt: Date.now() }); },
  };
}

module.exports = { makeCache };
