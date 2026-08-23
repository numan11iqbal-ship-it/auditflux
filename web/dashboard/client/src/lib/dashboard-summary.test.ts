import { describe, expect, it } from 'vitest';
import { overviewMetrics, prioritizedIssues, recentAudits } from './dashboard-summary';

describe('AuditFlux dashboard summary', () => {
  it('derives overview metrics only from a persisted audit and saved performance rows', () => {
    const metrics = overviewMetrics({ overall_score: 82, fail_count: 4, warn_count: 7, pass_count: 69 }, [{ source: 'LAB', performance_score: 76 }]);
    expect(metrics.map(metric => metric.value)).toEqual([82, 4, 7, 69, 76]);
  });

  it('prioritizes actual critical issues and preserves saved history values', () => {
    const issues = prioritizedIssues([{ id: 'notice', severity: 'notice', title: 'Later' }, { id: 'critical', severity: 'critical', title: 'First', detected: 'Observed in audit' }]);
    const audits = recentAudits([{ id: 'a1', url: 'https://example.com', overall_score: 82, fail_count: 4, captured_at: '2026-08-23T04:00:00.000Z' }]);
    expect(issues[0]).toMatchObject({ id: 'critical', title: 'First', detail: 'Observed in audit' });
    expect(audits[0]).toMatchObject({ id: 'a1', score: 82, issues: 4 });
  });
});
