'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const popup = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');

test('full report saves then opens the canonical SaaS audit instead of the legacy extension dashboard', () => {
  assert.match(popup, /\$\('#dashboardBtn'\)\.addEventListener\('click', \(\) => saveAuditToAuditFlux\(true\)\)/);
  assert.match(popup, /chrome\.tabs\.create\(\{ url: saved\.apiBase \+ '\/audit\/' \+ encodeURIComponent\(saved\.auditId\) \}\)/);
});

test('quick actions use the section routing contract and render active-state buttons', () => {
  assert.match(popup, /AUDITFLUX_QUICK_ACTIONS\.commandItems\(DATA, AUDIT\)/);
  assert.match(popup, /function isQuickActionActive\(item\) \{/);
  assert.match(popup, /quick-action \$\{isQuickActionActive\(item\) \? 'is-active' : ''\}/);
  assert.match(popup, /views = \{[\s\S]*headings: viewHeadings[\s\S]*resources: viewResources/);
  assert.match(popup, /if \(filter\) \{ activeTab = 'issues'; issueFilter = filter; return render\(\); \}/);
  assert.doesNotMatch(popup, /quickMore|syncQuickOverflow/);
});

test('heading overlay is enabled by default after a successful audit and remains toggleable from the header', () => {
  assert.match(popup, /await enableHeadingOverlayOnOpen\(\);/);
  assert.match(popup, /async function enableHeadingOverlayOnOpen\(\) \{/);
  assert.match(popup, /if \(!TAB \|\| overlayOn\) return;/);
  assert.match(popup, /const overlayButton = \$\('#overlayBtn'\);/);
});

test('popup startup safely tolerates the removed compact-header overlay control', () => {
  assert.match(popup, /const overlayButton = \$\('#overlayBtn'\);/);
  assert.match(popup, /if \(overlayButton\) overlayButton\.addEventListener\('click'/);
  assert.doesNotMatch(popup, /\$\('#overlayBtn'\)\.addEventListener/);
});
