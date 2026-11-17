# CATV – Phase 2 of 7: Users, User IDs, Custom Attributes

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

## Phase 2 Goal
Complete user management with the hierarchy, mandatory prefixed user IDs, Admin-only custom attributes, and commission rules set at creation.

## Tasks
1. **User creation and management**
   - Admin creates and manages all users (Distributor, Operator, Customer).
   - Distributor creates and manages only their own **Operators and Customers**.
   - Operator can create/manage their own Customers.
   - An **Operator can be created directly under Admin or under a Distributor** (`parentId`).
   - Edit, suspend/reactivate, soft delete, search, filters, server-side pagination.
2. **Mandatory User ID (`userCode`)** for Distributor, Operator, Customer:
   - Admin sets the **prefix per category** in a Settings screen (e.g. DST, OPR, CUS). All users in a category share one prefix; prefixes differ across categories.
   - Format `<PREFIX>-<zero-padded sequence>` e.g. `DST-00001`; padding length configurable.
   - Per-category counters generated **atomically** (row-locked counter or DB sequence) so concurrent creates never collide.
   - Changing a prefix affects **only new users**. `userCode` is unique, immutable, searchable.
3. **Custom attributes (Admin only)**
   - `AttributeDefinition` table: key, label, type (text, number, date, boolean, select), options, required, applicable roles.
   - JSONB `customData` on the user, validated against definitions.
   - Admin can add an attribute and set a value for a specific user, or define it for a whole role.
   - Distributor/Operator can **view** but never create, edit or delete definitions or values. Enforce in backend guards and hide in UI.
   - Custom attributes appear in user tables, filters and detail pages.
4. **Commission rule at creation**
   - When Admin creates a Distributor (and an Operator under a Distributor), the form requires a commission **type** (percentage or fixed) and **value**.
   - Store as a `CommissionRule` on that user with effective-from date; keep history when edited.
   - Only Admin can create or change commission rules.
5. **Audit log:** record all user creates/updates/status changes, attribute changes, prefix changes and commission rule changes (before/after, actor, IP). Add an Admin audit log table view.
6. **Frontend screens:** Users list per role, create/edit user form (dynamic fields from attribute definitions), user detail page, Settings (ID prefixes, attribute definitions), audit log.
7. **Seed update:** 1 Admin, 2 Distributors, 3 Operators (some direct, some under distributors), 10 Customers.

## Tests
- ID generation under concurrency (no duplicates, correct per-category prefix).
- Distributor cannot create/edit attributes or see users outside their subtree.
- Operator created under Admin vs under Distributor both work.

## Acceptance Criteria
- All rules above enforced at the API level, not just UI.
- Prefix change does not alter existing codes.
- Custom attribute value saved for one user shows in the table and detail view.
