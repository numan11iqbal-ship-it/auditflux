# Legacy Proxy Compatibility Layer

The repository-root Vercel API under `api/` is the **sole AuditFlux production API path**. It owns authenticated audit persistence and server-side PageSpeed/CrUX calls in the GitHub-to-Vercel deployment architecture.

This directory remains only as a repaired local compatibility proxy for extension development and testing. It does not define an independent production deployment. Its PageSpeed parser is imported from the existing extension engine, its missing cache and request guards are restored locally, and its original tests remain usable without an obsolete `scc/` directory.
