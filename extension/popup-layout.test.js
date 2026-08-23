'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, 'popup.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');

test('Chrome action popup keeps a wide intrinsic width instead of collapsing against the initial viewport', () => {
  assert.match(css, /:root\{--popup-width:800px;--popup-max:800px\}/);
  assert.match(css, /html\{width:var\(--popup-width\);overflow-x:hidden\}/);
  assert.match(css, /body\{\s*width:var\(--popup-width\);min-width:var\(--popup-width\);max-width:var\(--popup-width\);height:600px;/);
  assert.doesNotMatch(css, /max-width:100vw/);
  assert.doesNotMatch(css, /width:\s*(?:900|1000|1120)px/);
  assert.doesNotMatch(css, /min-width:\s*(?:900|1000)px/);
  assert.match(css, /@media \(min-width:560px\)\{[\s\S]*\.stats-4\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
});

test('popup uses readable two-row visible section tabs and local table scrolling rather than a root scrollbar', () => {
  assert.match(css, /\.quick-command\{\s*display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\);/);
  assert.match(css, /\.quick-action:nth-child\(5n\)\{border-right:0\}/);
  assert.doesNotMatch(css, /\.quick-more/);
  assert.match(css, /\.table-wrap\{width:100%;max-width:100%;overflow-x:auto;/);
  assert.match(css, /\.overlay-toggle\[aria-pressed="true"\]/);
  assert.match(css, /\.quick-action \.qa-icon,\.quick-action \.qa-short\{display:none\}/);
  assert.match(html, /<nav class="quick-command hidden" id="quickCommand"/);
  assert.match(html, /id="overlayBtn" aria-pressed="true"/);
  assert.match(html, /class="radar-loader"/);
});
