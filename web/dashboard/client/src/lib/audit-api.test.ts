import { describe, expect, it } from 'vitest';
import { normalizeSavedAudit, verifySavedAuditIdentity } from './audit-api';

describe('normalizeSavedAudit', () => {
  it('fills omitted child collections while preserving a valid core audit record', () => {
    const saved = normalizeSavedAudit({ audit: { id: 'audit-1', url: 'https://example.com' } });
    expect(saved.audit.id).toBe('audit-1');
    expect(saved.issues).toEqual([]);
    expect(saved.performance).toEqual([]);
  });

  it('rejects a response that would otherwise crash a saved-audit route', () => {
    expect(() => normalizeSavedAudit({ categories: [] })).toThrow('core audit record');
  });

  it('requires the persisted extension audit context to match the requested current audit ID and exact URL', () => {
    const saved = normalizeSavedAudit({ audit: { id: 'audit-current', url: 'https://social-media-downloader-sav-down.vercel.app/', payload: { auditContext: { source: 'extension', auditId: 'audit-current', auditedUrl: 'https://social-media-downloader-sav-down.vercel.app/', normalizedUrl: 'https://social-media-downloader-sav-down.vercel.app/' } } } });
    expect(verifySavedAuditIdentity(saved, { auditId: 'audit-current', normalizedUrl: 'https://social-media-downloader-sav-down.vercel.app/' })).toEqual({ auditIdMatch: true, urlMatch: true });
    expect(() => verifySavedAuditIdentity(normalizeSavedAudit({ audit: { id: 'audit-current', url: 'https://social-media-downloader-sav-down.vercel.app/', payload: {} } }), { auditId: 'audit-current', normalizedUrl: 'https://social-media-downloader-sav-down.vercel.app/' })).toThrow('Audit verification failed');
  });
});
