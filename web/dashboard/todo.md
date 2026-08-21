# AuditFlux Project TODO

- [x] Implement authenticated dashboard shell with DashboardLayout and five navigation sections: Projects, Audit History, Performance, Settings, Docs
- [x] Add dark responsive AuditFlux visual system with deep navy/slate palette, neon-green status accent, and monospaced metric values
- [x] Add Drizzle schema for users, projects, audit_runs, metrics, and per-user settings/secrets needed by the dashboard
- [x] Generate and apply database migrations
- [x] Add project CRUD procedures scoped to the authenticated user
- [x] Add audit history and performance metric query procedures scoped to the authenticated user
- [x] Add backend proxy URL configuration stored per user and connection-test procedure
- [x] Add client-only PageSpeed API key storage/display with explicit security warning and no raw-key persistence in audit payloads
- [x] Add secret-safe server-side audit ingestion endpoint/procedure that strips raw API keys before persistence
- [x] Add subscription entitlement display for exact tiers: Free, Pro, Enterprise
- [x] Add audit history feed with exact data-source labels: LIVE, LAB, FIELD
- [x] Add performance category breakdown for Performance, Accessibility, Best Practices, and SEO with pass/warn/fail/N-A counts
- [x] Add Vitest coverage for schema-facing helpers, project CRUD, ingestion sanitization, and configuration behavior
- [x] Verify TypeScript, tests, database migration, runtime, and responsive visual layout
- [x] Save a final project checkpoint after all requirements are complete
- [ ] Push the validated AuditFlux SaaS source to the dedicated AuditFlux GitHub repository
- [ ] Create and deliver a clean AuditFlux SaaS source ZIP without secrets, dependencies, or runtime artifacts
