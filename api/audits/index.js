const { applyCors, json, persistAudit, failure } = require('../_lib/auditflux');
function auditPersistedEvent(result) {
  return { event: 'audit_persisted', auditId: result.auditId, duplicate: Boolean(result.duplicate) };
}

async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const result = await persistAudit(req);
    console.info('auditflux', auditPersistedEvent(result));
    return json(res, 201, result);
  } catch (error) { return failure(res, error); }
}

module.exports = handler;
module.exports.auditPersistedEvent = auditPersistedEvent;
