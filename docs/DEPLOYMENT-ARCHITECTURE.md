# AuditFlux Deployment Architecture

AuditFlux uses a single, dedicated delivery path. The local Manus workspace is a development and preview environment only. The existing private `auditflux` GitHub repository is the permanent source of truth, and the existing Vercel project deploys that repository to production. No alternate GitHub repository, Vercel project, or unrelated infrastructure may be created for this product.

```text
Manus development and preview
        ↓
Existing AuditFlux GitHub repository
        ↓
Existing AuditFlux Vercel production project
        ↓
Existing AuditFlux Supabase project
        ↓
AuditFlux backend
        ↓
External APIs
```

The Manus preview domain is not a production dependency and must never be hard-coded in application source, redirect configuration, API callbacks, or environment templates. Production concerns are configured through environment variables supplied in the existing Vercel and Supabase environments.

| Environment variable | Purpose |
|---|---|
| `AUDITFLUX_SITE_URL` | Canonical production site URL served by the existing Vercel project. |
| `AUDITFLUX_BACKEND_URL` | AuditFlux backend base URL. |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing AuditFlux Supabase project URL, available to browser code where required. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing AuditFlux public Supabase client key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase administrative credential; never expose or commit it. |
| `PAGESPEED_API_KEY` | Server-only PageSpeed credential, when a backend proxy is configured. |
| `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` | Server-only billing configuration. |

Each change follows the same controlled release sequence: develop and test in Manus; verify Git root, status, and remote; commit only AuditFlux code with no environment files or secrets; push to the existing `auditflux` repository; and let the existing Vercel integration deploy it. The GitHub repository remains the source of truth throughout this process.

