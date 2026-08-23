import { describe, expect, it } from 'vitest';
import { connectionStateFromResponse, currentAuditHandoff, currentAuditRoute, handoffFromLocation, locateSucceeded, overlayToggled, rescanSucceeded } from './extension-bridge';

describe('AuditFlux extension bridge state', () => {
  it('exposes a connected state only for an explicit successful extension reply', () => {
    expect(connectionStateFromResponse({ ok: true })).toBe('connected');
    expect(connectionStateFromResponse({ ok: false })).toBe('failed');
    expect(connectionStateFromResponse(undefined)).toBe('failed');
  });

  it('acknowledges a locator only after the extension confirms a real highlighted target', () => {
    expect(locateSucceeded({ ok: true, located: true })).toBe(true);
    expect(locateSucceeded({ ok: true, located: false })).toBe(false);
    expect(locateSucceeded({ ok: false, located: true })).toBe(false);
  });

  it('requires a concrete heading-overlay state from the extension', () => {
    expect(overlayToggled({ ok: true, enabled: true })).toBe(true);
    expect(overlayToggled({ ok: true, enabled: false })).toBe(true);
    expect(overlayToggled({ ok: true })).toBe(false);
    expect(overlayToggled({ ok: false, enabled: true })).toBe(false);
  });

  it('requires a new persisted audit ID from a browser re-scan', () => {
    expect(rescanSucceeded({ ok: true, auditId: 'audit-new' })).toBe(true);
    expect(rescanSucceeded({ ok: true })).toBe(false);
    expect(rescanSucceeded({ ok: false, auditId: 'audit-new' })).toBe(false);
  });

  it('accepts only a complete extension current-audit handoff and preserves its exact audited URL in the route', () => {
    const handoff = currentAuditHandoff({ auditId: 'audit-current', clientAuditId: 'client-current', auditedUrl: 'https://social-media-downloader-sav-down.vercel.app/path?source=extension', normalizedUrl: 'https://social-media-downloader-sav-down.vercel.app/path?source=extension', hostname: 'social-media-downloader-sav-down.vercel.app', tabId: 17, auditTimestamp: '2026-08-23T10:00:00.000Z', extensionId: 'extension-id', workspaceSessionId: 'connection-id', source: 'extension' });
    expect(handoff).not.toBeNull();
    const route = currentAuditRoute('audit-current', 'reports', handoff!);
    expect(route).toContain('/audit/audit-current/reports?handoff=');
    expect(handoffFromLocation(route)).toEqual(handoff);
    expect(currentAuditHandoff({ ...handoff, source: 'legacy' })).toBeNull();
    expect(currentAuditHandoff({ ...handoff, auditedUrl: 'https://photoroom.com/' })).toBeNull();
  });
});
