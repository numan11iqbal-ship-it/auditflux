'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('H1–H6 toggle removes stale marker nodes even if the active flag is false', () => {
  const removed = [];
  const root = { parentNode: { removeChild(node) { removed.push(node); } } };
  const style = { parentNode: { removeChild(node) { removed.push(node); } } };
  const context = {
    window: { __sccOverlayActive: false },
    document: {
      getElementById(id) {
        if (id === 'scc-heading-overlay-root') return root;
        if (id === 'scc-heading-overlay-style') return style;
        return null;
      }
    },
    module: { exports: {} }
  };
  const source = fs.readFileSync(path.join(__dirname, 'content', 'overlay.js'), 'utf8');
  vm.runInNewContext(source, context);
  const result = context.SCC_TOGGLE_HEADING_OVERLAY();
  assert.equal(result.enabled, false);
  assert.equal(result.count, 0);
  assert.deepEqual(removed, [root, style]);
  assert.equal(context.window.__sccOverlayActive, false);
});
