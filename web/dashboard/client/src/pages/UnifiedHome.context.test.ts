import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'UnifiedHome.tsx'), 'utf8');

describe('context-free AuditFlux workspace landing', () => {
  it('loads a saved audit only when the route explicitly carries an audit ID', () => {
    expect(source).toContain('const target = routeAuditId;');
    expect(source).not.toContain('routeAuditId || historyResult.audits[0]?.id');
  });

  it('honestly asks the user to choose an audit rather than displaying a prior report', () => {
    expect(source).toContain('Choose An Audit To Review.');
    expect(source).toContain('Open Audit History');
  });
});
