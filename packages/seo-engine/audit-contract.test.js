const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAudit, normalizeAuditUrl, pageEssentials } = require('./audit-contract');

test('preserves the exact current audited host and path while repairing only accidental duplicated protocols', () => {
  assert.equal(normalizeAuditUrl(' https://social-media-downloader-sav-down.vercel.app/ '), 'https://social-media-downloader-sav-down.vercel.app/');
  assert.equal(normalizeAuditUrl('https://https://social-media-downloader-sav-down.vercel.app/path?source=a#section'), 'https://social-media-downloader-sav-down.vercel.app/path?source=a');
  assert.equal(normalizeAuditUrl('social-media-downloader-sav-down.vercel.app/'), 'https://social-media-downloader-sav-down.vercel.app/');
});

test('normalizes extension audit data and removes API credentials', () => {
  const payload = normalizeAudit({
    data: { page: { url: 'https://example.com/' }, scannedAt: '2026-08-22T00:00:00.000Z', headings: [], images: [], links: [], live: { dataSource: 'LIVE' }, source: { html: '<html />' } },
    audit: { overall: 77, counts: { totalRules: 4, evaluated: 3, passed: 1, warning: 1, critical: 1, notice: 0, notApplicable: 1 }, issues: [{ id: 'title', title: 'Title missing', evidence: ['none'], apiKey: 'must-not-persist' }, { id: 'LLMS_TXT_MISSING', category: 'geo', status: 'fail', title: 'No llms.txt file', evidence: ['not found'] }], passed: [{ id: 'AI_CRAWLER_ALLOWED', category: 'geo', status: 'pass', title: 'AI crawlers allowed' }], explanation: { contributions: [] } },
    performance: { live: { source: 'LIVE', token: 'must-not-persist' }, lab: [{ source: 'LAB', strategy: 'mobile', scores: { performance: 88 } }], field: [{ source: 'FIELD', strategy: 'mobile', metrics: { LCP: { value: 2100 } } }] },
  });
  assert.equal(payload.overallScore, 77);
  assert.equal(payload.coverage.na, 1);
  assert.equal(JSON.stringify(payload).includes('must-not-persist'), false);
  assert.equal(payload.performance.lab[0].strategy, 'mobile');
  assert.equal(payload.performance.field[0].metrics.LCP.value, 2100);
  assert.deepEqual(payload.geoAeo.map(item => item.signalKey), ['LLMS_TXT_MISSING', 'AI_CRAWLER_ALLOWED']);
});

test('creates one evidence-based Page Essentials object without inferring an unavailable HTTP response', () => {
  const essentials = pageEssentials({
    page: { url: 'https://example.com/articles/one?view=full', httpStatus: 200 },
    source: { status: 200, url: 'https://example.com/articles/one?view=full' },
    head: { canonical: 'https://example.com/articles/one?view=full', canonicalCount: 1, canonicalIsSelf: true, noindex: false, robotsMeta: 'index, follow' },
    robots: { pageAllowed: true }, security: { xRobotsTag: null }, pageType: { type: 'article', reasons: ['Article schema present'] },
  });
  assert.equal(essentials.url, 'https://example.com/articles/one?view=full');
  assert.equal(essentials.httpStatus, 200);
  assert.equal(essentials.httpStatusSource, 'extension_navigation');
  assert.equal(essentials.indexability, 'indexable');
  assert.equal(essentials.canonicalStatus, 'self-referencing');
  assert.equal(essentials.pageType, 'article');
  const unavailable = pageEssentials({ page: { url: 'https://example.com/' }, source: {}, head: {}, robots: {}, security: {}, pageType: {} });
  assert.equal(unavailable.httpStatus, null);
  assert.equal(unavailable.httpStatusAvailability, 'unavailable');
  assert.equal(unavailable.indexability, 'unknown');
  assert.equal(unavailable.pageType, 'unknown');
});
