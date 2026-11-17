# CATV – Phase 1 of 7: Foundation

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

## Phase 1 Goal
Set up the entire foundation so later phases only add features.

## Tasks
1. **Monorepo setup** with pnpm workspaces: `/apps/api` (NestJS), `/apps/web` (Next.js), `/packages/shared`, `/deploy`. Shared ESLint, Prettier, tsconfig base.
2. **Docker Compose** (`/deploy`): services `api`, `web`, `postgres`, `redis`, `nginx`. Health checks, named volumes, `.env.example`, a dev compose and a prod compose. Add a `pg_dump` **backup script** with retention.
3. **Prisma schema (initial)** and first migration:
   - `User` (id, role enum, email, phone, name, passwordHash, parentId nullable self-relation, status, createdAt, updatedAt, deletedAt)
   - `RefreshToken`, `AuditLog` (actor, action, entity, entityId, before, after, ip, createdAt)
   - Leave placeholders for later phases; do not model connections/billing yet.
4. **Auth module:** login, logout, refresh (JWT access + refresh in httpOnly secure cookies), password hashing with argon2/bcrypt, brute-force rate limiting.
5. **RBAC:** `@Roles()` decorator + guard, plus a reusable **data-scope helper** that returns the allowed user IDs for the current actor (Admin = all, Distributor = own subtree, Operator = own customers, Customer = self). All future queries must use it.
6. **Seed script:** one Admin account only for now.
7. **Frontend shell (Next.js):**
   - Golden design tokens in CSS variables + Tailwind config, dark and light mode toggle.
   - App layout: sidebar, top bar, role-aware navigation, login page, protected routes, 403/404 pages.
   - Register ECharts gold theme once (no charts yet).
   - API client with automatic token refresh.
8. **Swagger** at `/api/docs`, global validation pipe, global exception filter, structured logging, helmet, CORS allowlist.

## Before coding
Output the **Prisma schema** and the **folder structure** for my approval first, then implement.

## Acceptance Criteria
- `docker compose up` brings the whole stack up healthy.
- Admin can log in, refresh a session, log out.
- A non-Admin role cannot reach Admin-only routes (test it).
- Golden theme renders correctly in dark and light mode.
- Migrations and seed run cleanly on a fresh database.
