import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
for (const filename of ['audit-contract.js', 'audit-handoff.js']) {
  const source = path.join(root, 'packages', 'seo-engine', filename);
  const target = path.join(root, 'extension', 'engine', filename);
  fs.copyFileSync(source, target);
}
console.log('Synced shared AuditFlux audit contracts into the extension package.');
