# Unified AuditFlux Web App: Merge Plan

## Architecture decision

The SaaS workspace remains the only report interface. The old extension report code is retained temporarily as a **feature reference**, not as a second user destination. The Chrome extension’s `Full Report` control will ultimately open only the canonical route:

```text
Chrome Extension audit → normalized saved audit → /audit/:auditId/overview → one SaaS shell
```

The extension continues to own only audited-tab operations. It receives explicit commands from the authenticated SaaS workspace to locate an affected stored locator, toggle the heading overlay, and request a fresh re-scan. The Web App owns presentation, filters, evidence, exports, history, and the authenticated persisted audit record.

## Canonical URL and navigation contract

| Purpose | Canonical route | Existing shell behavior | Required change |
|---|---|---|---|
| Current audit overview | `/audit/:auditId/overview` | `/audit/:auditId` is always treated as Overview | Support explicit deep section routes and preserve the legacy route as a redirect/default. |
| Audit data section | `/audit/:auditId/:section` | Section URLs only work for the latest selected audit | Bind navigation paths to the selected persisted audit ID. |
| Source viewer | `/audit/:auditId/resources/source` | No deep source route | Treat source as an existing Resources subview, not another report page. |
| Latest audit workspace | `/:section` | Uses the latest saved audit | Keep as a convenience route, but visibly bind it to the selected latest audit. |
| Full Report handoff | `/audit/:auditId/overview` | Extension opens `/audit/:auditId` | Change after deep routes are implemented; no extension dashboard URL may be used. |

The `DashboardLayout` remains the single sidebar and header. Its audit links will be generated from the current selected audit ID whenever one exists, so the user never loses audit context while navigating between Overview, Issues, Headings, Links, Images, Schema, GEO/AEO, Performance, Accessibility, Technical, Security, Resources, and Resources/HTML Source.

## Data-adapter boundary

The production API already exposes normalized `categories`, `issues`, `headings`, `links`, `images`, `schema`, `resources`, `performance`, and `provenance` data alongside the secret-sanitized audit payload. The UI will introduce a typed **audit view adapter** that reads these existing fields and returns explicit availability states.

| View concern | Primary real source | Fallback source | Honest unavailable behavior |
|---|---|---|---|
| Score and coverage | Audit row and categories | Saved payload audit explanation | `Not Evaluated` rather than zero. |
| Issue evidence and remediation | Normalized issues | None | Existing field is omitted, not invented. |
| Heading/link/image diagnostics | Normalized rows | Saved detail payload where persisted | `Not Captured` for absent diagnostics. |
| Schema and raw source | Schema rows and sanitized payload | None | `Not Available` if raw content was not captured. |
| GEO/AEO and technical/security signals | Saved detail payload and issue records | GEO/AEO rows when returned | `Not Detected`, `Unknown`, or `Not Testable` as applicable. |
| Performance | Normalized performance and provenance | Saved performance payload | Source label is always LAB, FIELD, LIVE, BACKEND, or CALCULATED. |
| Browser actions | Saved locator plus extension connection | None | Disabled action with the actual reason if no originating tab/connection exists. |

No alternative database, standalone report payload, or mock fixture is introduced. If an audit field is required by the old report but absent from current persisted rows and the raw secret-sanitized payload, the implementation will first document that gap and then make one additive schema/API migration only when needed.

## Delivery sequence

| Increment | Unified workspace outcome | Non-duplication guard | Tests required |
|---|---|---|---|
| 1. Routing foundation | Deep `/audit/:id/:section` navigation with audit-bound sidebar links | One `Home` workspace and one `DashboardLayout` only | Route parser, route builder, active-navigation tests. |
| 2. Shared audit view model | Typed adapters for score/coverage/provenance/availability | Reads only the existing persisted audit response | Unit tests using real-shaped saved audit payloads. |
| 3. Overview and Issues parity | Score methodology, category counts, coverage, issue filters and evidence | Extends existing Overview and Issues functions | Adapter and rendered-state tests. |
| 4. Audit detail parity | Headings, Links, Images, Schema, GEO/AEO, Performance, Accessibility, Technical, Security, Resources, Source | One audit section renderer with no new dashboard route | Per-section data/availability tests. |
| 5. Workspace actions | Refresh, export CSV, copy report, print/PDF, audit history comparison entry points | Uses the currently selected persisted audit | Export content and action-routing tests. |
| 6. Browser bridge | Locate and heading-overlay actions, connection state, fresh re-scan request | Extension owns only DOM/tab operations | External-message and disabled-state tests. |
| 7. Loader and visual completion | AuditFlux radar loader for genuine fetch/save/rescan operations | Replaces only loading states inside the existing shell | Reduced-motion and stage-accuracy tests. |

## Browser-action protocol additions

The existing authenticated extension connection provides an API base and access token. The integration will add explicit, narrow message types rather than embedding browser behavior in the Web App:

| SaaS-originated message | Extension action | Required input | Expected response |
|---|---|---|---|
| `auditflux:locate` | Focus and highlight an audited locator | `auditId`, locator | `ok`, `PAGE_CHANGED`, or `TAB_UNAVAILABLE` |
| `auditflux:toggle-heading-overlay` | Add or remove current headings overlay | `auditId` and/or audited tab registry | Enabled state and heading count |
| `auditflux:rescan` | Re-run the deterministic engine on the registered audited tab | `auditId` | Fresh normalized audit or an honest inaccessible-tab state |

The Web App will never claim browser scanning, PageSpeed collection, or DOM location succeeded until the extension returns a positive result. Refresh remains a backend retrieval only; it will never trigger a scan.

## Release boundary

The old extension `dashboard.html` must not be removed until the acceptance matrix verifies real audit parity. Once the main SaaS workspace has all viable destinations, popup and action links will no longer open it. The release will then document it as a retired internal compatibility surface rather than a second AuditFlux product.
