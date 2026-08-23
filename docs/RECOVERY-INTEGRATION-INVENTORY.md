# AuditFlux Recovery Integration Inventory

## Scope and source of truth

This inventory covers the current tracked production-facing extension, shared audit engine, Vercel API, Supabase migrations, and unified SaaS workspace. It is an implementation inventory, not a new product design. The canonical persisted record remains the normalized audit accepted by `POST /api/audits`, stored in the existing AuditFlux Supabase project, and retrieved by the unified SaaS audit routes.

| Surface | Primary files inspected | Status | Notes |
| --- | --- | --- | --- |
| Manifest and browser bridge | `extension/manifest.json`, `extension/content/saas-bridge.js`, `extension/background.js` | **Working with recovery fix** | The content bridge is restricted to the canonical AuditFlux origin and relays nonce pairing and audit commands to the service worker. |
| Popup and current audit | `extension/popup.html`, `popup.js`, `popup.css`, `quick-actions.js` | **Partially working before recovery** | The popup has the real deterministic current audit and cache. Its Full Report guard checked the live session before deterministically matching its saved audit, producing the reported false connection message. |
| Deterministic SEO engine | `extension/engine/analyzer.js`, `rules.js`, `audit-contract.js`, `report.js`, `provenance.js`, `pagespeed.js`, `psi-cache.js`, `entitlements.js` | **Working and preserved** | The extension remains the sole page-analysis engine. The web app does not recreate SEO results. |
| Extension compatibility pages | `extension/dashboard.*`, `pricing.*`, `config/plans.js` | **Legacy / non-canonical** | These files remain packaged as compatibility surfaces. They must not become the primary SaaS dashboard or source of truth. |
| Current audit persistence | `extension/popup.js`, `api/audits/index.js`, `api/_lib/auditflux.js` | **Working with recovery fix** | New audits are normalized, authenticated through the extension session, sent to Vercel, and stored in Supabase. The returned `auditId` is cached locally only as a convenience pointer. |
| Pairing lifecycle | `api/extensions/index.js`, `api/_lib/extensions.js`, pairing migrations | **Working** | The server consumes one-time nonce challenges, binds a random installation ID to the authenticated user/workspace, and creates revocable short-lived sessions. |
| Unified SaaS workspace | `web/dashboard/client/src/pages/UnifiedHome.tsx`, `UnifiedAuditSection.tsx`, `DashboardLayout.tsx`, `audit-api.ts`, `audit-view.ts` | **Working** | This is the one canonical UI. It retrieves audits by ID from the Vercel API and renders full detail, actions, history, connection status, and Report Center. |
| Export & Report Center | `audit-export.ts`, `UnifiedAuditSection.tsx` | **Working** | PDF, XLSX, CSV ZIP, DOCX, standalone HTML, and JSON derive from one normalized saved audit. XLSX moves overlength exact evidence into a lossless Long Text sheet. |
| Legacy dashboard page | `web/dashboard/client/src/pages/Home.tsx` | **Disconnected legacy code** | The router imports `UnifiedHome`, not this file. It still contains manual `VITE_AUDITFLUX_EXTENSION_ID` messaging and must not be used for customer flows. It is inventory-only at this stage; no user path invokes it. |

## Local state boundaries

| Record | Storage role | Permitted use | Not permitted as source of truth |
| --- | --- | --- | --- |
| `sccLatestSavedAudit` | `chrome.storage.local` | Cache of `{ clientAuditId, auditId }` for reopening an already persisted audit | Primary SaaS report data |
| `sccLatestPerformance` | `chrome.storage.local` | Temporary matching performance data while constructing a new normalized audit | Historical performance authority |
| `auditfluxConnection` | `chrome.storage.session` | Short-lived extension session and API base for a paired browser | Long-lived user authentication or audit ownership |
| `auditfluxAuditTabRegistry` | `chrome.storage.local` | Audit ID to tab mapping for locate, overlay, and re-scan commands | Audit payload persistence |

## Recovery decision

The reported Full Report failure is a state-ordering defect, not a reason to create another dashboard or recreate the audit engine. The repair derives the current deterministic client audit ID first, reopens a matching persisted audit immediately, then consults the short-lived pairing session only when the current audit has not yet been saved. The popup also has a service-worker session lookup fallback, restricted to the extension popup context, for Chrome contexts where direct session storage is unavailable.

## Follow-up boundaries

The old `Home.tsx` page is the remaining manual-ID implementation found by the audit. Because it is not imported by the production router, it is isolated from customer operation. A future cleanup can remove or replace that dead legacy surface after its absence from all build entry points is re-confirmed; no production behavior depends on it.
