const { applyCors, failure, json, parseBody } = require('../_lib/auditflux');
const { confirmChallenge, connectionStatus, createChallenge, disconnect, heartbeat } = require('../_lib/extensions');

async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method === 'GET') return json(res, 200, await connectionStatus(req));
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    const action = parseBody(req).action;
    if (action === 'challenge') return json(res, 201, await createChallenge(req));
    if (action === 'confirm') return json(res, 201, await confirmChallenge(req));
    if (action === 'heartbeat') return json(res, 200, await heartbeat(req));
    if (action === 'disconnect') return json(res, 200, await disconnect(req));
    return json(res, 400, { error: 'Unknown extension connection action.' });
  } catch (error) { return failure(res, error); }
}

module.exports = handler;
