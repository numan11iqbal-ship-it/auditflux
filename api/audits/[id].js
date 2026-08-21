const { applyCors, json, loadAudit, failure } = require('../_lib/auditflux');
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try { return json(res, 200, await loadAudit(req, req.query.id)); } catch (error) { return failure(res, error); }
};
