# AuditFlux Integration State

## Confirmed dedicated infrastructure

| Component | Confirmed existing resource | Scope |
|---|---|---|
| Source repository | `numan11iqbal-ship-it/auditflux` | The only AuditFlux repository |
| Vercel project | `auditflux` (`prj_Qkey2WWnK1ePB70npfFD8i52ldSG`) | The only intended production deployment |
| Supabase project | `tvcvkpowxhcqgwbmzkdo` | The only AuditFlux PostgreSQL and Auth project |

## Applied Vercel configuration

The existing Vercel project has the following variables in its Production and Preview environments. Their values are managed in Vercel and are not committed to this repository.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Browser-facing Supabase endpoint |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-facing Supabase key, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Vercel API credential |
| `AUDITFLUX_SITE_URL` | Canonical Vercel site URL for API CORS |
| `VITE_AUDITFLUX_EXTENSION_ID` | Installed AuditFlux Chrome extension bridge identifier |
| `AUDITFLUX_EXTENSION_ORIGIN` | Restricted Chrome extension origin for API CORS |

## Production path

`Chrome Extension → Normalized Audit Contract → Vercel API → Supabase PostgreSQL → AuditFlux Dashboard`

The repository-root `api/` directory is the sole production API path. The legacy `backend/` proxy is retained only as a repaired local compatibility layer and must not be deployed independently.

## Remaining validation boundary

The production connection, secure configuration, and local tests have been verified. A user-authenticated browser run is still required to prove one live audit save, audit-detail retrieval, a second distinct audit in history, and issue location in the originating tab using real website data.
