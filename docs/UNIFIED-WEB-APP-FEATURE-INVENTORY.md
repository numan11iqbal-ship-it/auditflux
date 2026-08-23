# Unified AuditFlux Web App: Full Report Feature Inventory

## Purpose and non-duplication boundary

AuditFlux will retain **one** Web App shell, one sidebar, one header, one persisted audit record, and one canonical report route. The Chrome extension remains responsible only for page-bound browser operations: running a scan, injecting/removing the H1–H6 overlay, and locating a saved selector in the originating audited tab. It must not remain a separate reporting product.

The canonical report address is `/audit/:auditId/:section`, with `overview` as the default section. The existing normalized audit contract and the persisted `audits` record remain the single source of truth; extension UI data will not be copied into a second report model.

## Existing report capability map

| Existing Full Report capability | Existing persisted real-data source | Unified SaaS destination | Merge action | Browser responsibility retained |
|---|---|---|---|---|
| Audit score, verdict, timestamp, URL, HTTP/indexability summary | `audits`, `audit_categories`, normalized payload detail | **Overview** | Extend the current overview rather than create a report screen. | None. |
| Applicable, passed, critical, warning, notice, and not-applicable counts | `audits` coverage fields and normalized payload | **Overview** and **Issues** | Show exact saved counts and never synthesize missing values. | None. |
| Per-category passed/applicable scoring and calculation method | `audit_categories` plus stored payload explanation | **Overview** | Add score-method and category-contribution panels using saved engine output. | None. |
| Complete issue evidence, expected state, remediation, source, and category/severity filters | `audit_issues` | **Issues** | Expand existing issue rows into real evidence panels and filters. | **Locate on page** when a saved locator exists. |
| Heading hierarchy, level skips, empty/duplicate/question signals | `audit_headings` and stored payload detail | **Headings** | Add hierarchy, level badges, summary counts, and diagnostics to the existing section. | Locate a heading and toggle the existing H1–H6 overlay in the audited tab. |
| Link profile, detailed link table, rel/target signals, destinations | `audit_links` and stored payload detail | **Links** | Add search, filters, diagnostics, opening, and locator actions where stored. | Locate a link when a saved locator exists. |
| Image ALT/dimension/loading/format diagnostics | `audit_images` and stored payload detail | **Images** | Extend the existing image table with only captured diagnostics. | Locate an image when a saved locator exists. |
| JSON-LD, Microdata, RDFa, detected types, parse validity and raw block payload | `audit_schema_entities` and stored payload detail | **Schema** | Render captured structured-data diagnostics with copy support for stored JSON-LD. | None. |
| AI crawler rules, llms files, answer-readiness and content/entity signals | stored payload detail and `audit_geo_aeo_records` where persisted | **GEO / AEO** | Show detected, blocked, unavailable, and not-testable states separately; retain non-ranking disclaimer. | None. |
| Browser, LAB, and FIELD performance metrics with provenance | `performance_results`, `audit_provenance`, stored payload detail | **Performance** | Preserve separate source-labelled panels and avoid blending measurements. | PageSpeed/CrUX collection continues only through the extension/backend workflow. |
| Form, name/label, landmark, language, zoom, and DOM-visible accessibility signals | stored payload detail plus issue records | **Accessibility** | Add diagnostic groups and show unavailable/not-testable states honestly. | Locate a saved affected element where available. |
| HTTPS, mixed content, headers, robots, sitemaps, canonical, indexability and delivery details | stored payload detail and issue records | **Technical** and new **Security** subsection | Split general delivery/crawlability from security headers while preserving the same audit record. | None. |
| Response security header detail | stored payload detail | **Security** | Add a first-class audit nav item in the existing sidebar, not a new app or sidebar. | None. |
| Resource timing, transfer bytes, third-party, render-blocking and well-known files | `audit_resources` and stored payload detail | **Resources** | Extend the table with source-labelled resource inspection. | Open a resource URL only. |
| Server HTML, source search, copy and download | stored payload source where captured | **Resources → HTML Source** | Add a nested source view only when the saved payload contains source HTML. | None. |
| CSV, copy report, print / Save PDF | existing normalized audit data | **Reports** and global audit actions | Generate exports from the current stored audit in the single workspace. | None. |
| Refresh | authenticated `/api/audits/:id` | Global audit action | Reload saved audit data only; it never re-runs a browser audit. | None. |
| Re-scan | extension bridge and current audit provenance | Global audit action | Request a fresh browser scan, save a **new** audit ID, and preserve history. | Re-scan the originating page after the extension confirms it is reachable. |

## Current SaaS shell inventory

The current SaaS shell already has one `DashboardLayout` with audit navigation for Overview, Issues, Headings, Links, Images, Schema, GEO/AEO, Performance, Accessibility, Technical, and Resources. It also has Projects, History, Reports, and Settings. The merge must extend this shell with a **Security** audit item and the retained browser actions; it must not introduce another sidebar, header, full-report application, or visual identity.

The current `/audit/:id` route correctly loads a persisted detail record, but it defaults every audit path to Overview. The required routing upgrade is therefore deep section-aware routes such as `/audit/:auditId/overview`, `/audit/:auditId/issues`, and `/audit/:auditId/resources/source`. Existing workspace paths may retain their current behavior for the most recent audit, but a canonical Full Report must always identify and load its exact audit ID.

## Persisted data boundary

The production API already stores a secret-sanitized raw payload alongside normalized categories, issues, headings, links, images, schema entities, resources, performance results, and provenance. The merge will first consume these existing fields. A new schema or table is justified only when a required existing Full Report field is demonstrably absent from the persisted normalized contract; absent data must render as **Not Available**, **Not Detected**, **Not Testable**, or **Not Evaluated**, rather than as a fabricated score or count.

## Acceptance gates before retiring the old report surface

The extension Full Report control must save the current audit and open the canonical current-audit Overview in the existing SaaS shell. The same audit must match across score, coverage, issue counts, headings, links, images, schema, GEO/AEO, performance, accessibility, technical/security, and resources where data exists. Locate and H1–H6 overlay controls must remain extension-mediated. CSV export, report copy, print/save PDF, refresh, re-scan, and audit history must remain functional from the one SaaS workspace before any obsolete extension-report destination is removed.
