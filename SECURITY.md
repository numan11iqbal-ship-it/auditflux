# Security

## API keys

### The rule

**A Chrome extension cannot keep a secret.** It ships as a ZIP of static
files; unzipping and reading the JavaScript is normal, expected extension
behavior, not a bypass. Any value baked into that JavaScript — including one
substituted from an environment variable at build time — is plain text inside
the shipped package.

This shapes every decision below.

### Two supported modes

**1. Backend proxy (recommended for a real API key).**
Run `server/` yourself, put `PAGESPEED_API_KEY` in its `.env`, and point the
extension's Settings → AuditFlux backend at it. The key lives only on that
server. The extension calls the proxy; the proxy calls Google. See
`server/README.md`.

**2. Bring-your-own-key, client-only (for personal/local use).**
The Settings screen also has a plain "PageSpeed Insights" field. A key
entered there is stored in `chrome.storage.local` — readable by anything with
access to that browser profile. This is disclosed explicitly in the UI. It's
appropriate for a key you're comfortable treating as disposable (restricted by
IP/referrer in Google Cloud Console, low quota, easily rotated) — not for a
production secret. This mode is also why the extension still works with no
backend at all: PageSpeed works with no key too, at a lower rate limit.

Whichever key is more sensitive is the one that belongs in mode 1, not mode 2.

### What the backend server guarantees

- `PAGESPEED_API_KEY` is read from `process.env` in exactly one file,
  `server/src/config.js`.
- It never appears in an HTTP response — only the parsed PageSpeed result
  (scores, metrics, opportunities) is returned to the extension.
- It never appears in a log line. Every log call is routed through a
  `redact()` function that strips the configured key and the general shape of
  a Google API key (`AIza[0-9A-Za-z_-]{35}`) before anything is printed.
- It is never written to the cache — the cache stores only the already-parsed
  result.
- `server/test/proxy.test.js` verifies this against a real running server and
  real HTTP responses, including the failure path (upstream unreachable),
  which is the path most likely to accidentally leak a request URL containing
  the key into a log or error message.

### What the extension package guarantees

- `npm run verify:no-secrets` scans every file that would be zipped into the
  extension and fails if it finds: a `.env` file, a string shaped like a
  Google API key, or a hard-coded `PAGESPEED_API_KEY=` assignment. If
  `PAGESPEED_API_KEY` happens to be set in the environment running the scan,
  it additionally checks for that exact value verbatim across every shipped
  file.
- `.gitignore` excludes `.env` in both the repo root and `server/`.
- `.env.example` files (repo root and `server/`) contain placeholder values
  only.

Run the scan before every release:

```bash
npm run verify:no-secrets
```

### Chrome permissions

The extension requests only `activeTab`, `scripting`, and `storage` at
install time — no host access at all. `https://www.googleapis.com/*`,
`https://chromeuxreport.googleapis.com/*`, and (once you configure one) your
backend's origin are all **optional** host permissions, requested at the
moment you first use that feature.

### Reports and exports

Nothing performance-related in a copied report or CSV export ever includes an
API key — the export builders only ever see the parsed PageSpeed result
(scores, metrics, timings), never the request that produced it.

### If you find a problem

This is a template project, not a monitored production service. If you're
adapting it for your own deployment, treat `server/` as the trust boundary:
review it, restrict `ALLOWED_ORIGINS`, and consider adding your own
authentication in front of it before exposing it beyond localhost.
