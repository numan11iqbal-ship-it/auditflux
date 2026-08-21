import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const source = path.join(root, 'packages', 'seo-engine', 'audit-contract.js');
const target = path.join(root, 'extension', 'engine', 'audit-contract.js');
fs.copyFileSync(source, target);
console.log('Synced shared AuditFlux audit contract into the extension package.');
