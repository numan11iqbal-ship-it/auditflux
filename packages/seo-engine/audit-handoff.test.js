const test = require('node:test');
const assert = require('node:assert/strict');
const { createCurrentAuditHandoff, isCurrentAuditHandoff, verifyReturnedAudit, encodeHandoff, decodeHandoff } = require('./audit-handoff');

function handoff(auditId, url, tabId) {
  return createCurrentAuditHandoff({ auditId, clientAuditId: `client-${auditId}`, auditedUrl: url, normalizedUrl: url, tabId, auditTimestamp: '2026-08-23T10:00:00.000Z', extensionId: 'extension-id', workspaceSessionId: 'workspace-session' });
}

test('creates distinct authoritative current-audit envelopes for different tabs and domains', () => {
  const photoRoom = handoff('audit-a', 'https://www.photoroom.com/', 7);
  const downloader = handoff('audit-b', 'https://social-media-downloader-sav-down.vercel.app/', 11);
  assert.equal(isCurrentAuditHandoff(photoRoom), true);
  assert.equal(isCurrentAuditHandoff(downloader), true);
  assert.notEqual(photoRoom.auditId, downloader.auditId);
  assert.notEqual(photoRoom.auditedUrl, downloader.auditedUrl);
  assert.equal(decodeHandoff(encodeHandoff(downloader)).auditedUrl, 'https://social-media-downloader-sav-down.vercel.app/');
});

test('refuses a returned saved audit from a different ID or URL instead of allowing cross-audit substitution', () => {
  const expected = handoff('audit-b', 'https://social-media-downloader-sav-down.vercel.app/', 11);
  assert.deepEqual(verifyReturnedAudit(expected, { id: 'audit-b', url: 'https://social-media-downloader-sav-down.vercel.app/' }), { ok: true, auditIdMatch: true, urlMatch: true });
  assert.deepEqual(verifyReturnedAudit(expected, { id: 'audit-a', url: 'https://www.photoroom.com/' }), { ok: false, auditIdMatch: false, urlMatch: false });
});
