const { applyCors, json, safeHttpUrl } = require('./_lib/auditflux');
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  if (!process.env.PAGESPEED_API_KEY) return json(res, 503, { ok: false, error: 'NOT_CONFIGURED', message: 'PageSpeed data unavailable.' });
  const url = safeHttpUrl(req.query.url);
  const strategy = req.query.strategy === 'desktop' ? 'desktop' : req.query.strategy === 'mobile' ? 'mobile' : null;
  if (!url || !strategy) return json(res, 400, { ok: false, error: 'INVALID_REQUEST', message: 'A public URL and mobile or desktop strategy are required.' });
  const query = new URLSearchParams({ url: url.href, strategy, key: process.env.PAGESPEED_API_KEY });
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach(category => query.append('category', category));
  try {
    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}`, { signal: AbortSignal.timeout(20000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) return json(res, response.status || 502, { ok: false, error: 'PAGESPEED_UNAVAILABLE', message: body?.error?.message || 'PageSpeed data unavailable.' });
    const categories = body.lighthouseResult?.categories || {};
    const score = key => typeof categories[key]?.score === 'number' ? Math.round(categories[key].score * 100) : null;
    return json(res, 200, { ok: true, source: 'LAB', strategy, url: body.id || url.href, scores: { performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo') }, metrics: body.lighthouseResult?.audits || {} });
  } catch { return json(res, 502, { ok: false, error: 'PAGESPEED_UNAVAILABLE', message: 'PageSpeed data unavailable.' }); }
};
