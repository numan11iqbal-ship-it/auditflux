# Architecture

## Layers

```
engine/analyzer.js   Facts. Reads the DOM, fetches same-origin resources.
                     Reports what is there. Makes no judgements.
engine/rules.js      Judgement. 64 independent rules + scoring.
engine/report.js     Output. CSV builders and the plain-text report.
content/overlay.js   Page interaction. Heading overlay and locate-on-page.
popup.js             Quick audit surface.
dashboard.js         Full report surface.
shared/theme.css     One design system for both surfaces.
```

The split matters: facts and judgement are separate so a rule can change without touching extraction, and extraction can improve without rewriting rules. It is also why the same engine files run unmodified server-side in the SaaS backend.

## Why the analyzer is one big self-contained function

`chrome.scripting.executeScript` serializes the function to source and evaluates it in the target page. It therefore cannot reference anything outside its own body — no imports, no closures. That constraint is deliberate and must be preserved.

The same property lets the backend run this exact file under jsdom, so both products share one definition of what a page contains.

## Data flow

```
click icon → popup → executeScript(SCC_ANALYZE) → facts
                   → SCC_AUDIT(facts) → issues + scores
                   → chrome.storage.local
                   → render popup
"Full report"      → dashboard reads storage → renders (no re-analysis)
```

Analysis runs once. The dashboard is a reader, which is why opening it is instant.

## Re-scanning from the dashboard

The dashboard stores the originating `tabId` and re-injects on demand. Chrome's `activeTab` grant lapses when that tab navigates or closes; when that happens the re-scan fails and the user is told plainly, rather than being shown stale data as if it were fresh.

## Scoring

Severity weights: critical 5, warning 2, notice 1.

```
category = earned / applicable × 100
overall  = total earned / total applicable × 100
```

Rules returning `na` leave both numerator and denominator untouched. A page is never penalised for a check that did not apply to it — an HTTP page is not marked down for missing HSTS, and a page with no images is not marked down for alt text.

## Heading overlay

Labels live in one detached container positioned in document coordinates, repositioned on scroll and resize through `requestAnimationFrame`. A `MutationObserver` debounced at 300 ms rebuilds after SPA changes and ignores mutations inside the overlay itself, which would otherwise loop forever. Teardown removes the container, the stylesheet, both listeners and the observer.

## Security posture

All page-derived values pass through `esc()` before reaching `innerHTML`. The source viewer escapes first and only then applies search highlighting, so markup in the page source can never become live markup in the viewer.


## Performance: three data sources, never blended (v5)

The Performance module answers three independent questions, each backed by a separate collector with its own code path:

| Layer | Question | Source | Module |
|---|---|---|---|
| **LIVE** | How is this page performing right now, in my browser? | Chrome Performance APIs | `engine/analyzer.js` → `facts.live` |
| **LAB** | How does Google's Lighthouse lab evaluate it? | PageSpeed Insights v5 | `engine/pagespeed.js` |
| **FIELD** | How do real Chrome users experience it? | Chrome UX Report (via PSI or direct) | `engine/pagespeed.js` |

Every metric object carries its source, and the three never share a value. A failed Lighthouse call never blocks the Live section — they render independently in `dashboard.js`.

### Why LCP previously showed "Unavailable"

`performance.getEntriesByType('largest-contentful-paint')` does not return LCP entries in Chrome. LCP, layout-shift and event-timing entries are delivered **only** to a `PerformanceObserver`, and only entries observed with `buffered: true` include ones that occurred before the observer was created. The fix in `analyzer.js` (`collectBuffered`) uses a short-lived buffered observer per entry type and resolves once, rather than trying to read a static snapshot that was never populated.

This also produces three distinct states instead of one flat "unavailable":
- `measured` — a real value
- `not-measurable` — the API is supported but this page session produced no entry (e.g. no qualifying LCP element, or genuinely zero layout shift)
- `unsupported` — this browser does not implement the entry type at all
- `needs-interaction` — valid for INP only; requires the user to interact first

### PageSpeed caching and deduplication

`engine/psi-cache.js` caches successful results for 30 minutes, keyed by URL + strategy + whether an API key was used, and joins identical in-flight requests rather than firing duplicates. The daily usage counter increments **only** when a request actually reaches Google and gets a response — never on a cache hit, a deduped join, or a request blocked before sending (e.g. denied permission).
