#!/usr/bin/env node
/**
 * Verifies the packaged Chrome extension contains no secret. This is not a
 * manual claim — it runs against the actual files that get zipped and
 * shipped, and it is meant to run as part of packaging every time.
 *
 * Checks:
 *   1. No file under extension/ is named .env or matches a dotenv pattern.
 *   2. No file under extension/ contains a string shaped like a Google API key
 *      (the "AIza..." prefix Google uses).
 *   3. No file under extension/ contains a hard-coded PAGESPEED_API_KEY= assignment
 *      with a non-empty, non-placeholder value.
 *   4. If a real key is available via PAGESPEED_API_KEY at scan time (e.g. a
 *      developer testing locally with .env loaded), that exact value is also
 *      searched for verbatim across every shipped file.
 */
const fs = require('fs');
const path = require('path');

const SCC_DIR = path.join(__dirname, '..', 'extension');
const GOOGLE_KEY_RE = /AIza[0-9A-Za-z\-_]{35}/;
const ENV_ASSIGNMENT_RE = /PAGESPEED_API_KEY\s*=\s*['"]?[^\s'"]{10,}['"]?/;

function walk(dir, out) {
  out = out || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(SCC_DIR)) {
    console.error('FAIL  extension/ directory not found at ' + SCC_DIR);
    process.exit(1);
  }

  const files = walk(SCC_DIR);
  const problems = [];
  const realKey = process.env.PAGESPEED_API_KEY || null;

  for (const file of files) {
    const rel = path.relative(SCC_DIR, file);

    if (/(^|[\\/])\.env(\.|$)/.test(rel)) {
      problems.push(rel + ': a .env file must never be inside the extension package');
      continue;
    }

    if (/\.(png|jpg|jpeg|ico|woff2?|ttf|eot)$/i.test(rel)) continue;

    const text = fs.readFileSync(file, 'utf8');

    if (GOOGLE_KEY_RE.test(text)) {
      problems.push(rel + ': contains a string shaped like a Google API key');
    }
    if (ENV_ASSIGNMENT_RE.test(text) && !/PAGESPEED_API_KEY\s*=\s*(your_pagespeed_api_key_here|)\s*$/m.test(text)) {
      problems.push(rel + ': contains a hard-coded PAGESPEED_API_KEY assignment');
    }
    if (realKey && text.includes(realKey)) {
      problems.push(rel + ": contains the exact value of the developer's real PAGESPEED_API_KEY");
    }
  }

  console.log('Scanned ' + files.length + ' files under extension/');
  if (problems.length) {
    console.error('\nFAIL — the extension package is not safe to ship:\n');
    problems.forEach(function (p) { console.error('  - ' + p); });
    process.exit(1);
  }

  console.log('PASS — no .env file and no key-shaped string found anywhere under extension/');
  if (realKey) console.log('PASS — the real PAGESPEED_API_KEY from this environment does not appear in any shipped file');
  else console.log('INFO — PAGESPEED_API_KEY was not set in this environment, so that specific check was a no-op. Re-run with your real key exported to fully verify before shipping.');
  process.exit(0);
}

main();
