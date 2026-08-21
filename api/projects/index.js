const { applyCors, json, parseBody, requireUser, workspaceFor, safeHttpUrl, hostName, failure } = require('../_lib/auditflux');
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  try {
    const { db, user } = await requireUser(req);
    const workspaceId = await workspaceFor(db, user.id);
    if (req.method === 'GET') {
      const { data, error } = await db.from('projects').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      if (error) throw error;
      return json(res, 200, { projects: data });
    }
    if (req.method === 'POST') {
      const body = parseBody(req);
      const url = safeHttpUrl(body.primaryUrl);
      if (!url || !String(body.name || '').trim()) return json(res, 400, { error: 'A project name and public primary URL are required.' });
      const { data, error } = await db.from('projects').insert({ workspace_id: workspaceId, name: String(body.name).trim().slice(0, 160), domain: hostName(url.href), primary_url: url.href, urls: Array.isArray(body.urls) ? body.urls : [url.href], created_by: user.id }).select('*').single();
      if (error) throw error;
      return json(res, 201, { project: data });
    }
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) { return failure(res, error); }
};
