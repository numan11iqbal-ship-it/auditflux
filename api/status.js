const { applyCors, json } = require('./_lib/auditflux');
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  return json(res, 200, { ok: true, pagespeed: { configured: Boolean(process.env.PAGESPEED_API_KEY) }, crux: { configured: Boolean(process.env.CRUX_API_KEY) }, api: 'AuditFlux Vercel API' });
};
