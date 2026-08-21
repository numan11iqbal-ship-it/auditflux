# API — AuditFlux backend proxy

Base URL: wherever you run `server/` (default `http://localhost:8787`).

All responses are JSON. No endpoint ever returns an API key.

## `GET /api/status`

Reports whether the server has keys configured, without revealing them.

```json
{
  "ok": true,
  "pagespeed": { "configured": true },
  "crux": { "configured": false },
  "cacheTtlMs": 1800000
}
```

## `GET /api/pagespeed?url=<url>&strategy=mobile|desktop`

Runs Google PageSpeed Insights v5 for `url` with the given strategy, using the
server's own `PAGESPEED_API_KEY`. Requests `performance`, `accessibility`,
`best-practices`, and `seo` categories.

**Success (200)** returns scores, lab metrics, opportunities, diagnostics, an
`auditSummary` (applicable/passed/warning/failed/not-applicable counts
computed from the real response — never hard-coded), and any field data
Google returned alongside the lab run, plus `fromCache`/`deduped` flags.

**Failure:** always `{ "ok": false, "error": "<CODE>", "message": "<human text>" }`, with a status code matching the error:

| Status | `error` | Meaning |
|---|---|---|
| 503 | `NOT_CONFIGURED` | No `PAGESPEED_API_KEY` set on the server |
| 400 | `INVALID_URL` / `INVALID_STRATEGY` | Bad request parameters |
| 429 | `RATE_LIMIT` | Either this proxy's own limiter, or Google's |
| 403 | `INVALID_KEY` | Google rejected the configured key |
| 504 | `TIMEOUT` | Upstream request exceeded `PAGESPEED_TIMEOUT_MS` |
| 502 | `NETWORK` / `BAD_RESPONSE` | Could not reach Google, or got something unparseable |

## `GET /api/crux?url=<url>&strategy=mobile|desktop`

Queries Chrome UX Report directly using the server's `CRUX_API_KEY` (separate
from the PageSpeed key; both are optional independently). Returns the same
shape `sccParseCrux` produces on the client, so the UI code doesn't care which
transport was used.

`404` from Google is translated to `{ "ok": false, "error": "NO_DATA", ... }`
— a valid state, not an error, since most URLs simply don't have 28 days of
sufficient CrUX traffic yet.

## Caching, dedup, rate limiting

- Successful `/api/pagespeed` results are cached in memory per URL+strategy
  for `PAGESPEED_CACHE_TTL_MS` (default 30 min). A cache hit is marked
  `"fromCache": true` with an `"ageMs"` field and does not call Google again.
- Two simultaneous identical requests join one upstream call
  (`"deduped": true` on the joined response).
- Requests are capped at `RATE_LIMIT_PER_MINUTE` per client IP by this proxy,
  before anything reaches Google.

## Shared parsing module

`server/src/index.js` requires `scc/engine/pagespeed.js` directly — the exact
same file the extension loads in the browser. Whether a result came from the
extension calling Google directly (bring-your-own-key mode) or from this
proxy, the response shape is identical, because one function
(`sccParsePageSpeed`) produces it either way.
