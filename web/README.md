# AuditFlux SaaS Dashboard

This directory contains the authenticated AuditFlux dashboard source. It is intentionally isolated beneath the dedicated AuditFlux monorepo and does not include runtime dependencies, build output, local configuration, or credentials.

The application provides project management, audit-history and performance views, per-user backend-proxy settings, client-only API-key handling with an explicit warning, entitlement display, and server-side audit payload sanitization.

To run the dashboard locally, enter `web/dashboard`, install dependencies with `pnpm install`, create any required local environment values outside version control, and run `pnpm dev`. Before release, run `pnpm check`, `pnpm test`, and `pnpm build`.

