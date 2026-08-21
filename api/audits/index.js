const { applyCors, json, persistAudit, failure } = require('../_lib/auditflux');
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try { return json(res, 201, await persistAudit(req)); } catch (error) { return failure(res, error); }
};
