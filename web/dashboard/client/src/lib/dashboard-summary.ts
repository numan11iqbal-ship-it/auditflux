export type AuditRow = Record<string, any>;

const asNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function overviewMetrics(audit: AuditRow, performance: AuditRow[] = []) {
  const pageSpeed = performance.find(row => row.source === 'LAB') || performance[0];
  return [
    { label: 'SEO score', value: asNumber(audit.overall_score), tone: 'good' },
    { label: 'Issues', value: asNumber(audit.fail_count), tone: 'critical' },
    { label: 'Warnings', value: asNumber(audit.warn_count), tone: 'warning' },
    { label: 'Passed', value: asNumber(audit.pass_count), tone: 'good' },
    { label: 'PageSpeed', value: asNumber(pageSpeed?.performance_score), tone: 'warning' },
  ];
}

const severityOrder: Record<string, number> = { critical: 0, error: 1, warning: 2, notice: 3 };

export function prioritizedIssues(issues: AuditRow[]) {
  return [...issues]
    .sort((left, right) => (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9))
    .slice(0, 3)
    .map(issue => ({
      id: issue.id,
      title: issue.title || 'Untitled audit issue',
      detail: String(issue.detected || issue.evidence?.[0] || 'Saved audit evidence').slice(0, 88),
      severity: issue.severity || 'notice',
    }));
}

export function recentAudits(audits: AuditRow[]) {
  return audits.slice(0, 3).map(audit => ({
    id: audit.id,
    url: audit.url || 'Unknown URL',
    score: asNumber(audit.overall_score),
    issues: asNumber(audit.fail_count),
    capturedAt: audit.captured_at,
  }));
}
