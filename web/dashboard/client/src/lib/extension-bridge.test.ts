import { describe, expect, it } from 'vitest';
import { connectionStateFromResponse, locateSucceeded } from './extension-bridge';

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
});
