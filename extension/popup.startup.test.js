'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
  return {
    textContent: '', innerHTML: '', scrollTop: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; }
  };
}

test('popup starts when the compact header intentionally omits overlayBtn', async () => {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (selector === '#overlayBtn') return null;
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll() { return []; }
  };
  const chrome = {
    storage: { session: { get: async () => ({ auditfluxConnection: null }) }, local: { get: async () => ({}), set: async () => {} } },
    tabs: { query: async () => [{ id: 1, url: 'chrome://extensions/' }], create: () => {} },
    scripting: { executeScript: async () => [] },
    runtime: { sendMessage: async () => ({}) }
  };
  const context = {
    chrome, document, console, setTimeout, clearTimeout, URL, fetch: async () => ({ ok: false }),
    window: {}, SCC_ENTITLEMENTS: {}, SCC_CATEGORIES: [], SCC_AUDIT: () => ({}),
    AUDITFLUX_CONTRACT: {}, SCC_TOGGLE_HEADING_OVERLAY: () => {}, SCC_LOCATE_HEADING: () => {},
    sccNormalizeBackendUrl: () => null, sccRequestBackendPermission: async () => false
  };
  const source = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('#errorTitle').textContent, "This page can't be inspected");
});
