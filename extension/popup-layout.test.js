'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, 'popup.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');

test('Chrome action popup keeps an intrinsic compact width instead of collapsing against the initial viewport', () => {
  assert.match(css, /html\{width:var\(--popup-width\);overflow-x:hidden\}/);
  assert.match(css, /body\{\s*width:var\(--popup-width\);min-width:var\(--popup-width\);max-width:var\(--popup-width\);height:600px;/);
  assert.doesNotMatch(css, /max-width:100vw/);
  assert.doesNotMatch(css, /width:\s*(?:760|900|1000|1120)px/);
  assert.doesNotMatch(css, /min-width:\s*(?:900|1000)px/);
});

test('popup uses compact action priorities and local table scrolling rather than a root scrollbar', () => {
  assert.match(css, /\.quick-command\{\s*display:flex;flex-wrap:wrap;/);
  assert.match(css, /\.table-wrap\{width:100%;max-width:100%;overflow-x:auto;/);
  assert.match(css, /@media \(max-width:380px\)/);
  assert.match(html, /<nav class="quick-command hidden" id="quickCommand"/);
  assert.match(html, /class="radar-loader"/);
});
