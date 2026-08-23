const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('./engine/audit-contract.js');

test('retains captured server HTML evidence in the canonical saved audit detail when it exists', () => {
  const data = {
    page: { url: 'https://example.com/', origin: 'https://example.com' },
    scannedAt: '2026-08-23T00:00:00.000Z',
    headings: [], images: [], links: [],
    source: { fetched: true, status: 200, bytes: 41, html: '<html><title>Example</title></html>' },
  };
  const audit = { overall: 88, counts: {}, issues: [], passed: [], explanation: { contributions: [] } };
  const normalized = contract.normalizeAudit({ data, audit, tab: { id: 1, url: data.page.url } });

  assert.equal(normalized.detail.source.fetched, true);
  assert.equal(normalized.detail.source.html, '<html><title>Example</title></html>');
});
