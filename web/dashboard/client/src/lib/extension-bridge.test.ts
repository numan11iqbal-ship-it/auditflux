import { describe, expect, it } from 'vitest';
import { connectionStateFromResponse } from './extension-bridge';

describe('AuditFlux extension bridge state', () => {
  it('exposes a connected state only for an explicit successful extension reply', () => {
    expect(connectionStateFromResponse({ ok: true })).toBe('connected');
    expect(connectionStateFromResponse({ ok: false })).toBe('failed');
    expect(connectionStateFromResponse(undefined)).toBe('failed');
  });
});
