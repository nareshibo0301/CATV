# CATV – Phase 7 of 7: Hardening, Testing and Deployment

## Project Context (read first)

**CATV** is a production-grade management platform for a cable network business, hosted on a **private Ubuntu server** (Docker Compose, no cloud-only services).

**Roles:** ADMIN, DISTRIBUTOR, OPERATOR, CUSTOMER (end user). Operators can sit directly under Admin or under a Distributor.

**Fixed stack (do not substitute):** Node.js 20 + NestJS (TypeScript strict), PostgreSQL 16 (JSONB), Prisma, Redis + BullMQ, Next.js (App Router) + Tailwind + shadcn/ui, Apache ECharts, TanStack Table, ExcelJS, pdfmake, JWT auth with RBAC, Swagger/OpenAPI.

**Monorepo:** `/apps/api`, `/apps/web`, `/packages/shared` (types, enums, zod schemas), `/deploy`.

**Theme:** golden. Primary `#D4AF37`, light gold `#F5E6A8`, deep gold `#B8860B`, dark bg `#14120B` / `#1C1A12`, light bg `#FBF8EE`. Use design tokens only, never hard-coded colours.

**Working rules:**
- Build only what this phase describes. Do not start later phases.
- Server-side permission checks on every endpoint; never trust the UI.
- Strict TypeScript, validated inputs, meaningful commit-sized steps.
- At the end, stop, summarise what was built, list any assumptions, and wait for my "continue".

---

## Phase 7 Goal
Make the system production-ready for the private server: security, performance, tests, documentation, and deployment.

## Tasks
1. **Security review and fixes**
   - Re-audit every endpoint for role and data-scope checks (produce a permission matrix table in the docs).
   - Rate limiting, helmet, strict CORS, CSRF protection for cookie auth, secure cookie flags, password policy, account lockout, session revocation.
   - Dependency audit, secrets only via env, no secrets in logs, input/output sanitisation, SQL injection and XSS checks, file upload limits (if any).
   - Encrypt integration credentials and API-key hashes verified.
2. **Performance**
   - Review slow queries with `EXPLAIN`, add missing indexes (users.parentId, connections status/dates, invoices, payments, ledger).
   - Connection pooling, Redis caching for dashboard aggregates with correct invalidation, pagination everywhere.
3. **Testing**
   - Unit tests for ID generation, commission rules, free-to-paid job, permission scoping.
   - **E2E tests** for: Admin creates Distributor → Operator → Customer; publish → pending → paid activation → invoice → payment → commission → payout; free activation → auto conversion → billing; exports; API key + webhook flow.
   - Report coverage and fix gaps in critical modules.
4. **Seed and demo data:** rich, realistic seed (multiple distributors, direct and nested operators, hundreds of customers, connections in every state, invoices, payments, commissions) behind a `--demo` flag.
5. **Observability:** structured logs, request IDs, `/health` and `/ready` endpoints, basic metrics endpoint, error tracking hook, queue dashboard (Bull Board) restricted to Admin.
6. **Deployment (private Ubuntu server)**
   - Production Docker Compose with Nginx reverse proxy, HTTPS via Let's Encrypt or provided certificates, gzip, security headers, upload size limits.
   - Zero-downtime-ish update script (pull, migrate, restart), rollback instructions.
   - **Automated Postgres backups** (cron + retention), tested **restore procedure**, Redis persistence config.
   - Firewall/ufw guidance, non-root containers, log rotation.
7. **Documentation** (`/docs`): README quick start, architecture overview, ER diagram, permission matrix, business-rules summary (free period, commission), API guide, webhook guide with signature verification samples (Node and PHP), deployment and backup guide, admin user manual.
8. **Final QA checklist** run-through against the original business rules:
   - Admin-only custom attributes, Distributor cannot add them.
   - Prefix per category, shared within category.
   - Pending → paid goes to billing; free → no commission; auto conversion to paid.
   - Dashboard charts/funnels and CSV/Excel/PDF on every report.
   - API in/out and webhooks working.

## Acceptance Criteria
- Fresh server install from the docs works end to end.
- All tests pass in CI-style run; the QA checklist is fully ticked, with any known limitations listed honestly.
- Backup restore verified on a clean database.
