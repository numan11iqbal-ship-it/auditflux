import { describe, expect, it } from 'vitest';
import { auditCoverage, auditDetail, categoryContribution, pageEssentials, scoreMethod, securityStatus, sourceStatus } from './audit-report';

const saved = {
  audit: {
    coverage_applicable: 20, pass_count: 17, critical_count: 1, warn_count: 2, notice_count: 0, na_count: 4, coverage_total: 24,
    payload: { categories: [{ id: 'technical', label: 'Technical', checks: 4, passed: 3 }], provenance: { scores: { method: 'Deterministic weighted audit checks' } }, detail: { pageEssentials: { url: 'https://example.com/audit', urlSource: 'extension_location', httpStatus: null, httpStatusSource: 'unavailable', httpStatusAvailability: 'unavailable', indexability: 'unknown', indexabilityReason: 'Browser capture could not determine robots directives for this page.', indexabilitySource: 'unavailable', canonicalUrl: null, canonicalStatus: 'missing', canonicalSource: 'unavailable', canonicalEvidence: 'No canonical link element was captured.', pageType: 'unknown', pageTypeConfidence: 'unavailable', pageTypeEvidence: ['No reliable classification signal was captured.'] }, source: { fetched: true, html: '<html><title>AuditFlux</title></html>' }, security: { available: true, hsts: { present: true } } } },
  },
  categories: [], issues: [], headings: [], links: [], images: [], schema: [], resources: [], performance: [], provenance: [],
} as any;

describe('unified saved-audit detail adapter', () => {
  it('uses persisted coverage and does not infer a fabricated count', () => {
    expect(auditCoverage(saved)).toEqual({ applicable: 20, pass: 17, critical: 1, warning: 2, notice: 0, notApplicable: 4, total: 24 });
  });

  it('exposes captured source and security only when saved in the audit payload', () => {
    expect(auditDetail(saved).source).toEqual({ fetched: true, html: '<html><title>AuditFlux</title></html>' });
    expect(sourceStatus(saved).available).toBe(true);
    expect(securityStatus(saved).available).toBe(true);
    expect(sourceStatus(null)).toMatchObject({ available: false, reason: 'The source HTML was not captured for this audit.' });
  });

  it('uses the normalized category rows and score methodology retained by the extension contract', () => {
    expect(categoryContribution(saved)).toEqual([{ id: 'technical', label: 'Technical', checks: 4, passed: 3 }]);
    expect(scoreMethod(saved)).toBe('Deterministic weighted audit checks');
  });

  it('uses the one persisted Page Essentials object rather than ambiguous UI fallback labels', () => {
    expect(pageEssentials(saved)).toMatchObject({ url: 'https://example.com/audit', urlSource: 'extension_location', httpStatus: null, httpStatusAvailability: 'unavailable', indexability: 'unknown', pageType: 'unknown' });
  });
});
