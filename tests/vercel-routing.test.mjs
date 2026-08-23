import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

test('Vite SPA fallback does not rewrite AuditFlux API routes to index.html', () => {
  const fallback = config.rewrites.find(route => route.destination === '/index.html' && route.source.includes('?!api/'));
  assert.ok(fallback, 'SPA fallback must exclude the /api/ namespace');
  assert.equal(config.rewrites.some(route => route.source === '/:path*'), false, 'unscoped SPA fallback must not shadow API functions');
});
