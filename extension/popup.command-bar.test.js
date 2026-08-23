'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const popup = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');

test('full report saves then opens the canonical signed-in Export & Report Center instead of a deployment alias or legacy extension dashboard', () => {
  assert.match(popup, /\$\('#dashboardBtn'\)\.addEventListener\('click', \(\) => saveAuditToAuditFlux\(true\)\)/);
  assert.match(popup, /const AUDITFLUX_WEB_APP_ORIGIN = 'https:\/\/auditflux\.vercel\.app';/);
  assert.match(popup, /chrome\.tabs\.create\(\{ url: auditFluxWebAppUrl\('\/audit\/' \+ encodeURIComponent\(saved\.auditId\) \+ '\/reports'\) \}\)/);
  assert.match(popup, /auditflux:get-popup-connection/);
  assert.match(popup, /const payload = AUDITFLUX_CONTRACT\.normalizeAudit\(\{ data: DATA, audit: AUDIT, tab: TAB, performance \}\)/);
  assert.match(popup, /saved\?\.clientAuditId === payload\.clientAuditId && openWhenSaved/);
  assert.match(popup, /auditFluxWebAppUrl\('\/connect-extension'\)/);
});

test('top-bar Web App action opens the current audited page in the canonical signed-in AuditFlux application', () => {
  assert.match(popup, /const webAppButton = \$\('#webAppBtn'\);/);
  assert.match(popup, /async function openWebAppForCurrentAudit\(\) \{/);
  assert.match(popup, /if \(DATA && AUDIT && TAB && connection\?\.apiBase && \(connection\?\.accessToken \|\| connection\?\.sessionToken\)\) \{\s*return saveAuditToAuditFlux\(true\);/);
  assert.match(popup, /chrome\.tabs\.create\(\{ url: auditFluxWebAppUrl\('\/'\) \}\)/);
  assert.match(popup, /webAppButton\.addEventListener\('click', \(\) => void openWebAppForCurrentAudit\(\)\)/);
});

test('visible popup controls use the approved Title Case labels', () => {
  const html = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
  for (const label of ['Free', 'H1–H6', 'Web App', 'Re-Scan', 'Full Report', 'Try Again']) {
    assert.match(html, new RegExp(`>${label}<`));
  }
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
