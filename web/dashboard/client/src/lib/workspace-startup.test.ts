import { describe, expect, it } from 'vitest';
import { workspaceStartupState } from './workspace-startup';

const state = (overrides: Partial<Parameters<typeof workspaceStartupState>[0]> = {}) => workspaceStartupState({ authLoading: false, authenticated: true, loadingAudits: false, routeAuditId: null, extension: 'connected', auditCount: 1, error: null, ...overrides });

describe('workspace startup state', () => {
  it('keeps the shell in a checking state until the current browser is known', () => expect(state({ extension: 'unknown' })).toBe('CHECKING_EXTENSION'));
  it('loads a real audit when a paired workspace has a saved history record', () => expect(state()).toBe('READY'));
  it('shows an empty state only after a paired workspace has no persisted audits', () => expect(state({ auditCount: 0 })).toBe('NO_AUDIT'));
  it('routes an unpaired browser through the connection lifecycle instead of an empty overview', () => expect(state({ extension: 'not_connected', auditCount: 1 })).toBe('NO_EXTENSION'));
});
