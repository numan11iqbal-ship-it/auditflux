const { applyCors, json, publicRuntimeStatus } = require('./_lib/auditflux');
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  return json(res, 200, { ok: true, ...publicRuntimeStatus(), api: 'AuditFlux Vercel API' });
};
