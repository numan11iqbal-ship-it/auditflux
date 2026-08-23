import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'UnifiedHome.tsx'), 'utf8');
const appSource = readFileSync(resolve(__dirname, '..', 'App.tsx'), 'utf8');
const bridgeSource = readFileSync(resolve(__dirname, '..', 'lib', 'extension-bridge.ts'), 'utf8');

describe('unified AuditFlux workspace startup', () => {
  it('loads only an explicit route audit or a higher-priority current extension handoff', () => {
    expect(source).toContain('const target = expectedHandoff?.auditId || routeAuditId;');
    expect(source).toContain('expectedHandoff ? await auditApi.currentExtensionAudit(token, expectedHandoff)');
    expect(source).not.toContain('routeAuditId || historyResult.audits[0]?.id');
  });

  it('prevents an earlier audit request from overwriting the requested audit and verifies the server response identity', () => {
    expect(source).toContain('auditRequestSequence');
    expect(source).toContain('requestSequence !== auditRequestSequence.current');
    expect(source).toContain('loaded.audit?.id');
  });

  it('never substitutes history latest for a connected browser without a current handoff', () => {
    expect(source).toContain('workspaceStartupState');
    expect(source).not.toContain("extensionConnection === 'connected' && history[0]?.id");
    expect(source).not.toContain("setLocation(auditPath(String(history[0].id), 'overview'))");
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

  it('revalidates real workspace data after narrow extension and audit events without a browser reload', () => {
    expect(source).toContain('subscribeWorkspaceEvents');
    expect(bridgeSource).toContain('AUDITFLUX_EXTENSION_CONNECTED');
    expect(bridgeSource).toContain('AUDITFLUX_AUDIT_SAVED');
    expect(source).toContain("document.addEventListener('visibilitychange'");
    expect(source).not.toContain('window.location.reload');
    expect(source).toContain('currentAuditHandoff(event?.payload)');
    expect(source).toContain('currentAuditRoute(handoff.auditId, \'overview\', handoff)');
    expect(bridgeSource).toContain('export type CurrentAuditHandoff');
    expect(bridgeSource).toContain('handoffFromLocation');
  });

  it('clears current evidence and reports an explicit verification failure instead of silently substituting an old audit', () => {
    expect(source).toContain('setSelected(null)');
    expect(source).toContain('Audit verification failed. The returned audit does not match the current extension audit.');
    expect(source).toContain('Current audit could not be loaded. The extension handoff was invalid.');
  });

  it('registers the in-workspace connection URL instead of routing it to a separate dashboard or 404 state', () => {
    expect(appSource).toContain('<Route path="/connect-extension" component={Home} />');
  });
});
