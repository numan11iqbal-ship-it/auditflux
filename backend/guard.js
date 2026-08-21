function makeInflight() {
  const pending = new Map();
  return {
    key: (url, strategy) => `${url}::${strategy}`,
    join(key, factory) {
      if (pending.has(key)) return { promise: pending.get(key), deduped: true };
      const promise = Promise.resolve().then(factory).finally(() => pending.delete(key));
      pending.set(key, promise);
      return { promise, deduped: false };
    },
  };
}

function makeRateLimiter(limit) {
  const records = new Map();
  const windowMs = 60_000;
  return {
    check(clientId) {
      const now = Date.now();
      const recent = (records.get(clientId) || []).filter(timestamp => now - timestamp < windowMs);
      if (recent.length >= limit) return { allowed: false, retryAfterMs: windowMs - (now - recent[0]) };
      recent.push(now); records.set(clientId, recent);
      return { allowed: true };
    },
  };
}

module.exports = { makeInflight, makeRateLimiter };
