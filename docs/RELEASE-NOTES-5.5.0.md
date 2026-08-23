# AuditFlux 5.5.0 Release Notes

AuditFlux 5.5.0 delivers the requested **Export & Report Center** and replaces customer-managed extension identifier setup with automatic secure browser pairing. The release remains within the existing AuditFlux GitHub repository, Vercel project, and Supabase project. No additional dashboard, database, or deployment was created.

## Export & Report Center

The Chrome extension’s **Full Report** action now opens the saved audit’s canonical `/audit/:id/reports` route inside the existing AuditFlux workspace. The center builds all downloads from one normalized, persisted audit report rather than synthesized or placeholder values.

| Format | Output characteristics |
| --- | --- |
| PDF | Client-ready layout with score coverage, action plan, issues, and evaluated module tables. |
| Excel/XLSX | Structured workbook sheets for all export datasets. |
| Complete CSV ZIP | Separate logical CSV datasets for summary, issues, headings, links, images, schema, resources, categories, performance, GEO/AEO, provenance, source capture, security, and audit detail. |
| Word/DOCX | Editable report with the action plan and evaluated module tables. |
| Offline HTML | Standalone report retaining real data and captured HTML availability. |
| JSON | Full normalized report object for programmatic reuse. |

The interactive **View Full Report** route remains the existing canonical audit workspace. Exports only represent fields actually persisted for the audit; unavailable modules state their availability honestly.

## Automatic Browser Pairing

The AuditFlux website communicates with the extension through an official-origin Chrome content-script bridge. The web application creates a short-lived, single-use connection nonce only after the member is authenticated. The installed extension completes the nonce exchange with a random installation identifier and receives a short-lived, revocable session token. The identifier is installation-scoped metadata, not a user credential.

The browser connection page is available inside the same workspace at `/connect-extension`. It exposes connection status, test/reconnect, connected browser records, and disconnect. It never asks a customer to copy an extension ID, Vercel value, Supabase credential, access token, or API key.

> **Upgrade instruction:** Existing installations must be reloaded once with the 5.5.0 package so Chrome can register the official AuditFlux content bridge. After this one-time update, members connect from the webpage without configuring an extension ID.

## Security Controls

The automated path accepts bridge messages only from `https://auditflux.vercel.app`. Pairing nonces expire after five minutes and are atomically consumed before a session is issued. Extension sessions expire after twelve hours, are stored only in Chrome session storage, are hashed server-side, and are revocable through either the website or the paired extension. The `extension_sessions` table is explicit server-only under RLS; browser clients cannot read or write it.

The only remaining Supabase security advisory is the project-wide optional Auth setting for leaked-password protection. It does not expose extension sessions or create a pairing-table policy gap; it should be enabled by the workspace owner in Supabase Auth settings when operationally appropriate.
