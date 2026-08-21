# AuditFlux SEO

A Chrome extension that audits any page for technical SEO, on-page, headings,
links, images, schema, performance, accessibility and AI/GEO readiness — plus
an optional backend proxy for a secure, real Google PageSpeed Insights
integration.

```
scc/      the Chrome extension (load this folder unpacked)
server/   optional backend proxy — holds your real PAGESPEED_API_KEY
scripts/  verify-no-secrets.js — scans scc/ before every release
test/     extension test suite (459 tests total across this repo)
```

## Quick start — extension only, no key

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `scc/`
2. Click the icon on any site

PageSpeed already works with no key at all, using Google's unauthenticated
tier. Nothing below is required to use the product.

## Real PageSpeed API key — two ways to add one

**You told me not to put a real key in this chat or in source code, and
nothing here asks you to.** Both paths below load the key from your own
`.env` file, which you create locally after this implementation is done.

### Recommended: the backend proxy

The extension is a plain ZIP of static files — unzipping it and reading the
JavaScript is normal extension behavior, not a bypass. That means **nothing
baked into the extension can stay secret**, including a value substituted
from an environment variable at build time. So a real key belongs on a
server, not in the extension.

```bash
cd server
npm install
cp .env.example .env
# edit server/.env — set PAGESPEED_API_KEY=<your real key>
npm start
```

Then in the extension: **Settings → AuditFlux backend** → enter
`http://localhost:8787` → **Test Connection**. From then on, PageSpeed
requests route through your server and the extension never sees the key.
Full details: `server/README.md`, `scc/API.md`, `scc/SECURITY.md`.

### Alternative: bring your own key, client-only

Settings also has a plain "PageSpeed Insights" key field for personal/local
use. A key entered there lives in `chrome.storage.local` — readable by
anything with access to that browser profile, and the UI says so. Use this
only for a key you're comfortable treating as disposable (IP/referrer
restricted, low quota). It's the path that existed before this backend was
added, and it still works if you never set up a server.

## Performance data — three sources, never blended

- **LIVE** — measured in your browser, this page, right now (Performance APIs)
- **LAB** — Google PageSpeed Insights / Lighthouse, via direct call or your backend
- **FIELD** — Chrome UX Report, real users, 75th percentile

Every metric is labelled with its source. A failed PageSpeed call never
blocks the rest of the audit — live data renders independently underneath it.

### What the Performance tab now shows, computed live from the real response

```
Performance   83 / 100
42 of 51 applicable checks passed · 6 warnings · 3 failed · 12 not applicable
```

`sccSummarizeAudits()` in `scc/engine/pagespeed.js` walks the real
`categories[*].auditRefs` against `audits[*].scoreDisplayMode`/`.score` from
the actual API response. `informative`, `notApplicable`, `manual`, and
`error` audits are counted separately and never treated as passed. Nothing
here is hard-coded — see `test/backend.test.js` for a fixture proving the
counts are computed, not literal.

## Verify no secret ever ships in the extension

```bash
npm run verify:no-secrets
```

Scans every file that gets zipped into `scc/` and fails the build if it finds
a `.env` file, a Google-API-key-shaped string, or a hard-coded
`PAGESPEED_API_KEY=` assignment. If your real key happens to be exported in
the shell running the scan, it additionally checks for that exact value
verbatim. Run this before every release — it catches a planted leak and
passes a clean build; see `scc/SECURITY.md`.

## Testing

```bash
npm test              # extension: 424 tests
cd server && npm test # backend proxy: 35 tests, real HTTP, real server
```

**459 tests total.** New in this change: `test/backend.test.js` (backend
client transport + the Lighthouse audit-checks summary) and
`server/test/proxy.test.js` (the proxy itself — config redaction, cache,
dedup, rate limiting, and live HTTP requests against the real Express app,
including a genuine network failure, checking the key never appears in a
response body or a console log line under any of it).

### Not verified here
No live call to `googleapis.com` has been made from this sandbox — there's no
route to it. Parsing, caching, error classification, and the key-redaction
guarantees are tested against real HTTP and fixtures shaped like real
responses; the actual network round trip to Google is not. Run `npm start`
in `server/` with your real key, connect the extension to it, and run one
real PageSpeed check before trusting it end to end.

## Docs

- `scc/API.md` — backend proxy endpoints and error codes
- `scc/SECURITY.md` — the full key-handling model
- `scc/ARCHITECTURE.md` — extension architecture, scoring, the LCP fix
- `server/README.md` — backend setup and deployment notes
