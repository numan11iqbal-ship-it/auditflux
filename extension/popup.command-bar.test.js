'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const popup = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');

test('full report saves and opens the exact current audit Reports route instead of a deployment alias, legacy dashboard, or generic workspace', () => {
  assert.match(popup, /async function openFullReport\(\) \{\s*const tab = await chrome\.tabs\.create\(\{ url: auditFluxWebAppUrl\('\/'\), active: true \}\);\s*await saveAuditToAuditFlux\(true, tab\?\.id, 'reports'\);/);
  assert.match(popup, /\$\('#dashboardBtn'\)\.addEventListener\('click', \(\) => void openFullReport\(\)\)/);
  assert.match(popup, /const AUDITFLUX_WEB_APP_ORIGIN = 'https:\/\/auditflux\.vercel\.app';/);
  assert.match(popup, /function openSavedAudit\(handoff, section, tabId\) \{/);
  assert.match(popup, /AUDITFLUX_HANDOFF\.encodeHandoff\(handoff\)/);
  assert.match(popup, /chrome\.tabs\.update\(tabId, \{ url \}\)/);
  assert.match(popup, /auditflux:get-popup-connection/);
  assert.match(popup, /async function currentAuditPayload\(\)/);
  assert.match(popup, /chrome\.tabs\.get\(TAB\.id\)/);
  assert.match(popup, /sameAuditUrl\(auditedTab\.url, TAB\.url\)/);
  assert.match(popup, /AUDITFLUX_CONTRACT\.normalizeAudit\(\{ data: DATA, audit: AUDIT, tab: TAB, performance \}\)/);
  assert.match(popup, /body\.clientAuditId !== payload\.clientAuditId/);
  assert.match(popup, /sameAuditUrl\(body\.auditUrl, payload\.url\)/);
  assert.doesNotMatch(popup, /chrome\.storage\.local\.get\(\{ sccLatestSavedAudit/);
  assert.match(popup, /CURRENT_AUDIT_SAVE\?\.key === saveKey/);
  assert.match(popup, /This current-tab audit is already saved to AuditFlux/);
  assert.match(popup, /function handoffForSavedAudit\(payload, response, connection\)/);
  assert.match(popup, /source: 'extension'/);
  assert.match(popup, /chrome\.runtime\.sendMessage\(\{ type: 'auditflux:audit-saved', handoff \}\)/);
  assert.match(popup, /auditFluxWebAppUrl\('\/connect-extension'\)/);
});

test('top-bar Web App action saves and opens the exact current audit Overview route without falling back to a previous workspace audit', () => {
  const webAppFunction = popup.match(/async function openWebAppForCurrentAudit\(\) \{[\s\S]*?\n\}\n\nfunction showState/)[0];
  assert.match(popup, /const webAppButton = \$\('#webAppBtn'\);/);
  assert.match(popup, /async function openWebAppForCurrentAudit\(\) \{/);
  assert.match(webAppFunction, /chrome\.tabs\.create\(\{ url: auditFluxWebAppUrl\('\/'\), active: true \}\)/);
  assert.match(webAppFunction, /saveAuditToAuditFlux\(true, tab\?\.id, 'overview'\)/);
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
