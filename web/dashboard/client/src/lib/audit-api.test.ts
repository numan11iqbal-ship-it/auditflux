import { describe, expect, it } from 'vitest';
import { normalizeSavedAudit } from './audit-api';

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
});
