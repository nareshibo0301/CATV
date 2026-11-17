# CATV – Phase 3 of 7: Connections, Activation and Billing

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

## Phase 3 Goal
Build the connection lifecycle, paid/free activation, billing, and the automatic free-to-paid conversion.

## Data Model (add via migration)
`Plan`, `Connection`, `ConnectionStatusHistory`, `Invoice`, `InvoiceItem`, `Payment`, `FreePeriod`.

Connection key fields: customerId, planId, publishedById, distributorId/operatorId (denormalised for scoping and reports), status, activationType (PAID/FREE), `freeStartDate`, `freeEndDate`, `freeReason`, activatedAt.

## Lifecycle
`PENDING_ACTIVATION → ACTIVE_PAID` or `ACTIVE_FREE → ACTIVE_PAID`, plus `SUSPENDED`, `DISCONNECTED`.

## Tasks
1. **Plans:** Admin CRUD (name, price, billing cycle, tax %, active flag).
2. **Publish a connection:** creates it in **PENDING_ACTIVATION**. Admin/Distributor/Operator can publish within their data scope.
3. **Activation:**
   - **Paid:** connection becomes ACTIVE_PAID and goes **directly into Billing** (invoice generated).
   - **Free:** **Admin only**. Requires start date, duration (1 month, 2 months, custom) and reason (initial offer, loyalty offer, other). Becomes ACTIVE_FREE. No invoice during the free period.
   - Admin can also grant a free access period to an **already-active** customer at any time (offer), with the same fields.
4. **Automatic conversion job (BullMQ, daily + on-startup catch-up):**
   - Finds ACTIVE_FREE connections where `freeEndDate` has passed, converts them to ACTIVE_PAID, and generates the first invoice.
   - Must be **idempotent**, retry-safe, logged, and record a status-history row ("auto: free period ended").
5. **Billing:**
   - Invoice generation (one-time activation + recurring cycle invoices via scheduled job), invoice numbering, due dates, tax.
   - Payments: cash, UPI, bank transfer, other; **partial payments** allowed; outstanding balance per invoice and per customer.
   - Receipt and invoice **PDF** generation (pdfmake).
   - Late/overdue status.
6. **Status history:** every transition stores who, when, from, to, reason.
7. **Frontend:** Plans page, Connections list (filters: status, distributor, operator, activation type), publish form, activation modal (paid/free), connection detail with timeline, Billing page (invoices, payments, outstanding), Customer portal view (own connections, invoices, payments).

## Tests
- Free period expiry converts exactly once, even if the job runs twice.
- Non-Admin cannot set a connection to free.
- Partial payment updates outstanding correctly.
- Data scoping: Distributor sees only own subtree's connections and invoices.

## Acceptance Criteria
- Publish → pending → paid activation creates an invoice immediately.
- Free activation creates no invoice; after `freeEndDate` it converts to paid automatically and bills.
- Full status timeline visible on every connection.

> Note: do NOT build commission calculations yet (Phase 4). Just keep `distributorId`/`operatorId` and `activationType` stored cleanly so Phase 4 can use them.
