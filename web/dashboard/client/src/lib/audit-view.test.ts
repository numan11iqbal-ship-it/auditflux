import { describe, expect, it } from 'vitest';
import { auditIdFromLocation, auditPath, routeSection } from './audit-view';

describe('saved audit routes', () => {
  it('renders a direct saved-audit route as the overview report', () => {
    expect(routeSection('/audit/5c905591-0f3d-4259-ac94-6ba052a44dd2')).toBe('overview');
  });

  it('extracts an encoded saved-audit ID without relying on selected audit state', () => {
    expect(auditIdFromLocation('/audit/audit%2Fid')).toBe('audit/id');
    expect(auditIdFromLocation('/history')).toBeNull();
  });

  it('preserves the selected audit while routing to a real audit detail section', () => {
    const id = '5c905591-0f3d-4259-ac94-6ba052a44dd2';
    expect(auditPath(id, 'issues')).toBe(`/audit/${id}/issues`);
    expect(routeSection(`/audit/${id}/issues`)).toBe('issues');
    expect(routeSection(`/audit/${id}/security`)).toBe('security');
    expect(routeSection(`/audit/${id}/reports`)).toBe('reports');
  });
});
