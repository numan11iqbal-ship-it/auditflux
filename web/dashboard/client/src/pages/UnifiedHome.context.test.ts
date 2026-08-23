import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'UnifiedHome.tsx'), 'utf8');
const appSource = readFileSync(resolve(__dirname, '..', 'App.tsx'), 'utf8');

describe('unified AuditFlux workspace startup', () => {
  it('loads a saved audit only when the route explicitly carries an audit ID', () => {
    expect(source).toContain('const target = routeAuditId;');
    expect(source).not.toContain('routeAuditId || historyResult.audits[0]?.id');
  });

  it('routes a paired browser to the latest real saved audit and reserves the empty state for a workspace with no audits', () => {
    expect(source).toContain('workspaceStartupState');
    expect(source).toContain("extensionConnection === 'connected' && history[0]?.id");
    expect(source).toContain("setLocation(auditPath(String(history[0].id), 'overview'))");
    expect(source).toContain('No Audits Yet.');
    expect(source).not.toContain('Choose An Audit To Review.');
  });

  it('uses automatic official-origin pairing and never requires a customer-provided extension ID', () => {
    expect(source).toContain('Extension Connected');
    expect(source).toContain('connectExtension(token)');
    expect(source).toContain('Connect AuditFlux Extension');
    expect(source).toContain("section === 'settings' || section === 'connect-extension'");
    expect(source).not.toContain('VITE_AUDITFLUX_EXTENSION_ID');
    expect(source).not.toContain('runtime.sendMessage');
  });

  it('registers the in-workspace connection URL instead of routing it to a separate dashboard or 404 state', () => {
    expect(appSource).toContain('<Route path="/connect-extension" component={Home} />');
  });
});
