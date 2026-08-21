const { applyCors, json, requireUser, workspaceFor, failure } = require('../_lib/auditflux');
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { db, user } = await requireUser(req);
    const workspaceId = await workspaceFor(db, user.id);
    const { data, error } = await db.from('audits').select('id,project_id,url,captured_at,overall_score,pass_count,warn_count,fail_count,critical_count,notice_count,na_count,coverage_total,coverage_applicable').eq('workspace_id', workspaceId).order('captured_at', { ascending: false }).limit(100);
    if (error) throw error;
    return json(res, 200, { audits: data });
  } catch (error) { return failure(res, error); }
};
