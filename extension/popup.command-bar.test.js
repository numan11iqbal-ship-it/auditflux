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
  assert.match(popup, /quick-action \$\{activeTab === item\.id \? 'is-active' : ''\}/);
  assert.match(popup, /views = \{[\s\S]*headings: viewHeadings[\s\S]*geo: viewGeo/);
});
