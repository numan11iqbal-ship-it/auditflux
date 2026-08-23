const assert = require('node:assert/strict');
const test = require('node:test');
const { auditPersistedEvent } = require('./index');

test('audit persistence runtime event includes only non-secret tracing metadata', () => {
  const event = auditPersistedEvent({ auditId: 'audit-123', duplicate: false, url: 'https://private.example/path', payload: { apiKey: 'secret' } });
  assert.deepEqual(event, { event: 'audit_persisted', auditId: 'audit-123', duplicate: false });
  assert.equal(JSON.stringify(event).includes('private.example'), false);
  assert.equal(JSON.stringify(event).includes('secret'), false);
});
