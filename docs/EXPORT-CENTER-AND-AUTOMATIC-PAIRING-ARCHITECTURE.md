# AuditFlux Export Center and Automatic Extension Pairing

## Product Boundary

AuditFlux retains one interactive SaaS workspace and one persisted audit record per scan. The Export & Report Center is a focused route within that workspace, not a second dashboard. Every generated document is derived from the same saved-audit record that powers the Overview, Issues, and other interactive sections.

| Concern | Decision |
|---|---|
| Current audit source | The authenticated `GET /api/audits/:id` saved-audit response is the only export input. |
| Export location | The existing canonical per-audit `reports` route becomes **Export & Report Center**. |
| Supported formats | PDF, XLSX, complete CSV ZIP, DOCX, standalone HTML, and JSON are generated only from the normalized saved-audit report object. |
| Missing data | A module that was not captured is represented as **Not Evaluated** or **Not Available**, never with generated values. |
| Full Report behavior | The extension saves the current audit, then opens its canonical Export & Report Center route. **View Full Report** opens the existing interactive Overview for that same audit. |

## Normalized Report Contract

The client-side `NormalizedAuditReport` adapter is constructed from `SavedAudit` only. It keeps audit metadata, coverage, categories, issues, headings, links, images, schema, performance, GEO/AEO records, resources, source/provenance, security, captured HTML when available, and a severity-ordered action plan. The adapter contains no scoring rules and does not invent values; the deterministic engine’s persisted results remain authoritative.

## Supported Export Behavior

| Format | Delivery | Data fidelity requirement |
|---|---|---|
| PDF | Branded client-facing report with executive summary, score breakdown, action plan, issues, and evaluated modules. | Includes real audit values and evidence; raw HTML source remains a separate attachment/download. |
| XLSX | Structured workbook with summary, module-specific sheets, raw data, hyperlinks, frozen headings, and filterable issue rows. | Every sheet is populated from the shared report object. |
| CSV ZIP | A ZIP containing logically separate CSV datasets such as issues, headings, links, images, schema, resources, and categories. | No unrelated datasets are forced into one CSV. |
| DOCX | Editable client-ready document with cover, summary, action plan, modules, evidence, and URLs. | Generated from the same severity-sorted issues and module records. |
| HTML | Standalone offline report with embedded CSS, navigation, filters, searchable issues, modules, and clickable URLs. | Contains no SaaS runtime dependency. |
| JSON | Complete machine-readable normalized report object. | Preserves audited fields and availability/provenance semantics. |

## Automatic Extension Connection

Chrome does not permit a normal website to enumerate arbitrary installed extensions. The production solution therefore uses an **AuditFlux-owned content-script bridge** rather than asking a customer for an extension ID. The extension declares the official AuditFlux web origins in its own Manifest V3 configuration and injects a small bridge only on those origins. The SaaS UI sends a nonce challenge through `window.postMessage`; the bridge verifies the page origin and forwards it to the extension service worker. This gives the SaaS an automatic feel without exposing browser configuration to the customer.

The extension then confirms the challenge with the existing AuditFlux backend, including its randomly generated installation identifier, manifest version, browser platform, supported capabilities, and the one-time challenge. The backend authenticates the web user at challenge creation, verifies the nonce hash and expiry at confirmation, then creates or refreshes one connection record for that user and workspace.

> Chrome’s supported `externally_connectable` manifest property allows only explicitly matched web pages to communicate with an extension, while Runtime messaging exposes sender origin metadata for trust decisions. The content-script bridge adds an official-origin-only automatic detection path for unpacked and production builds without making the user enter an ID. [Chrome externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable) · [Chrome Runtime messaging](https://developer.chrome.com/docs/extensions/reference/api/runtime)

| Layer | Responsibility |
|---|---|
| SaaS web app | Creates an authenticated short-lived challenge and renders user-friendly connecting, connected, expired, and disconnected states. |
| Content script | Exists only on centralized AuditFlux web origins, accepts a narrow protocol, and relays the challenge to the extension runtime. |
| Extension service worker | Maintains an AuditFlux-generated installation ID in extension storage, exchanges the challenge for a revocable short session, and exposes status, test, and disconnect actions. |
| Vercel API | Creates, confirms, refreshes, lists, and revokes pairing records; it never exposes service-role credentials. |
| Supabase | Stores workspace-scoped connection records, one-time challenge hashes, and revocable short sessions using additive tables and existing RLS ownership conventions. |

## Backward Compatibility

The existing `externally_connectable` route remains available temporarily for older installed copies. New extension builds prefer the content-script pairing protocol. The Vercel environment extension ID stays an internal migration compatibility setting only; it is removed from every customer-facing UI and no customer is asked to discover, copy, or configure it.

## Security Controls

The pairing system accepts only exact AuditFlux web origins, uses a random one-time nonce stored as a server-side hash, expires pending challenges quickly, records only an AuditFlux installation ID rather than treating Chrome’s extension ID as user identity, and issues revocable short-lived extension sessions. The extension does not receive a Supabase service-role key or a permanent user browser token. Disconnect revokes sessions and updates the stored connection state. All audit and export ownership continues to be enforced by the existing user-and-workspace authorization checks.
