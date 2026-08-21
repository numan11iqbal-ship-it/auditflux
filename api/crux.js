const { applyCors, json, safeHttpUrl } = require('./_lib/auditflux');
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  if (!process.env.CRUX_API_KEY) return json(res, 503, { ok: false, error: 'NOT_CONFIGURED', message: 'CrUX unavailable.' });
  const url = safeHttpUrl(req.query.url);
  const strategy = req.query.strategy === 'desktop' ? 'DESKTOP' : req.query.strategy === 'mobile' ? 'PHONE' : null;
  if (!url || !strategy) return json(res, 400, { ok: false, error: 'INVALID_REQUEST', message: 'A public URL and mobile or desktop strategy are required.' });
  try {
    const response = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(process.env.CRUX_API_KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.href, formFactor: strategy }), signal: AbortSignal.timeout(20000) });
    const body = await response.json().catch(() => null);
    if (response.status === 404) return json(res, 200, { ok: false, error: 'NO_DATA', message: 'CrUX has no field data for this URL.' });
    if (!response.ok || !body) return json(res, response.status || 502, { ok: false, error: 'CRUX_UNAVAILABLE', message: body?.error?.message || 'CrUX unavailable.' });
    return json(res, 200, { ok: true, source: 'FIELD', strategy: strategy === 'PHONE' ? 'mobile' : 'desktop', metrics: body.record?.metrics || {} });
  } catch { return json(res, 502, { ok: false, error: 'CRUX_UNAVAILABLE', message: 'CrUX unavailable.' }); }
};
