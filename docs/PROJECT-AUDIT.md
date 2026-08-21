# AuditFlux Integration Audit

**Audit date:** 22 August 2026
**Scope:** The dedicated `auditflux` repository, the existing Vercel project, and the existing Supabase project. This audit records verified implementation status; it does not treat planned functionality as complete.

## Current architecture

The repository already contains a substantial Manifest V3 Chrome extension under `extension/`, an independently authored PageSpeed/CrUX proxy under `backend/`, and a separate React/Vite SaaS shell under `web/dashboard/`. The extension contains a deterministic DOM analyzer, rules engine, PageSpeed parser, provenance logic, reports, overlay support, and local caching. The SaaS shell contains user-scoped project and summary audit procedures, but it is not yet connected to the extension as a persisted audit source.

| Layer | Verified implementation | Integration status |
|---|---|---|
| Chrome extension | Deterministic page analysis, rules, live browser measurements, headings overlay, local extension dashboard, exports, and backend-client helpers. | **Partially working locally.** Results are handed to the extension dashboard through `chrome.storage.local`, not saved to the SaaS backend. |
| Extension-to-web handoff | Popup can open the extension’s own `dashboard.html`. | **Disconnected.** No persisted audit ID, deployed web-app URL, or authenticated save flow is present. |
| Standalone backend | Intended PageSpeed and CrUX proxy with redaction, cache, deduplication, rate limiting, and status endpoints. | **Broken.** The entry point imports missing `cache`, `guard`, and obsolete `../../scc/engine/pagespeed.js` paths. |
| Web dashboard | Projects, summary audit history, category metrics, settings, and entitlement presentation. | **Partially implemented.** It persists summary data only and does not render the extension’s complete audit payload. |
| Shared package | `packages/` is present. | **Missing.** No common audit contract or reusable pure PageSpeed/provenance package currently exists. |
| Database | Existing Supabase project is active and currently has no public tables. | **Unmigrated.** The web shell instead uses MySQL-oriented Drizzle schema and procedures. |
| Vercel | Existing `auditflux` Vercel project is present and points at the dedicated repository. | **Not configured for the dashboard build.** The most recent deployment completed without a framework build or dependency installation, consistent with the repository root not being a configured application entry point. |

## Working functionality to preserve

The extension’s `SCC_ANALYZE` function already produces real, JSON-serializable page facts: document and head metadata, headings, content, links, images, schema, technology signals, robots, sitemaps, llms resources, security headers, browser performance, resources, accessibility signals, and mobile signals. The deterministic rules engine remains the correct source of audit judgement, while the analyzer remains the source of current-page DOM facts. None of this should be duplicated inside the web app.

The analyzer also preserves provenance distinctions: browser observation is labeled `LIVE`, while the existing proxy design separately handles PageSpeed laboratory results and CrUX field results. This separation must be retained in the normalized audit contract and database model.

## Verified gaps and risks

The extension manifest currently has no background service worker and no `externally_connectable` allowlist. The deployed web app therefore has no supported, restricted mechanism to locate an issue in the originating Chrome tab. In addition, individual analyzer output records do not yet contain the durable selector, XPath, index path, attribute hint, or element hash required for exact issue location.

The popup caches `{ data, audit, tabId, savedAt }` in extension-local storage and opens the bundled extension report. This correctly avoids duplicate browser analysis, but it is not a backend handoff and cannot populate the SaaS dashboard after a different session or device is used. The extension also uses locally editable entitlement state; server-side entitlement validation and usage accounting remain required.

The SaaS web app is coupled to Manus OAuth, Manus runtime configuration, and MySQL/Drizzle conventions. These are not acceptable as the permanent Vercel/Supabase production architecture. Its current content wrapper also has a global `max-w-[1800px]` constraint, which prevents the requested unconstrained, wide-data SaaS layout.

## Required migration path

The authoritative production API must be consolidated behind the Vercel-deployed AuditFlux web/API layer. The obsolete standalone proxy imports should not be deployed as a competing service. Its validated design concepts—server-only keys, SSRF-safe URL validation, rate limiting, cache and request deduplication, error redaction, PageSpeed parsing, and separate CrUX responses—should be moved into a single shared production API layer.

The repository needs one normalized, versioned audit contract in `packages/seo-engine/`. It must carry summary scores, coverage, categories, issues, evidence, locators, source/provenance metadata, detailed analyzer output, and separate `LIVE`, `LAB`, and `FIELD` payloads. The extension must create this contract after a deterministic audit, submit it without API keys, retain a tab registry for location actions, and open the deployed web report using a persisted audit identifier.

The current MySQL-specific dashboard persistence must be replaced in a single migration with the existing Supabase PostgreSQL project, Supabase Auth, server-enforced ownership, and row-level security. Production database changes must begin with an audited, non-destructive baseline migration because the existing Supabase public schema is empty. Vercel must be configured to build the intended dashboard root and given the corresponding production environment variables through its existing project settings.

## Deployment and security status

The existing private GitHub repository remains the only AuditFlux source repository. The existing Vercel project is named `auditflux`; its latest production deployment was ready but did not run a framework build. The existing Supabase project is active and has no public tables. No new GitHub repository, Vercel project, or Supabase project is required.

No hard-coded Manus preview URL was found in the audited repository source. The current source still includes Manus-specific auth and runtime code, so those dependencies must be removed or replaced before the Vercel deployment can be treated as independently production-ready. No credential-shaped values were detected by the repository scan, and secret-safe packaging checks remain in place.

## Acceptance status

The product is **not yet end-to-end integrated**. The extension engine works as a source of real page facts, but extension-to-backend persistence, backend-to-Supabase storage, backend-authenticated web retrieval, deployed report routing, secure tab location, Vercel-compatible production build, Supabase Auth, and the complete detail dashboard are pending implementation and validation.
