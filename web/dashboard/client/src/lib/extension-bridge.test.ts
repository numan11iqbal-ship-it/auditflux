import { describe, expect, it } from 'vitest';
import { connectionStateFromResponse, locateSucceeded, overlayToggled, rescanSucceeded } from './extension-bridge';

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
});
