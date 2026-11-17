# CATV – Phase 4 of 7: Commission Engine

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

## Phase 4 Goal
Build the commission engine and payout ledger on top of Phase 2 (commission rules) and Phase 3 (billing).

## Business Rules (strict)
- Commission is earned **only** when the connection is **paid** and was done **via a Distributor** (directly by the Distributor, or by an Operator under that Distributor).
- **No commission while a connection is ACTIVE_FREE.** Commission starts from the first paid invoice after the free period converts to paid.
- Connections done by a **direct Operator under Admin** earn no distributor commission.
- The commission rate is decided by Admin at creation (Phase 2 `CommissionRule`). **Snapshot** the applicable rule (type, value) onto each commission entry at billing time so later rate changes never alter past commissions.
- If both the Distributor and the Operator under them have a rule, document and implement a clear resolution (default: Operator-level rule overrides the Distributor's for connections that Operator handles; state this assumption and make it easy to change).

## Tasks
1. **Prisma:** `CommissionLedger` (distributorId, operatorId nullable, connectionId, invoiceId, baseAmount, ruleType, ruleValue, commissionAmount, status PENDING/APPROVED/PAID/CANCELLED, payoutId nullable, createdAt) and `Payout` (distributorId, period, total, method, reference, paidAt, paidById).
2. **Commission calculation service:** triggered when a payment is recorded against an eligible invoice (event-driven, via BullMQ). Calculate on **amount actually paid**, so partial payments produce proportional commission. Idempotent per payment.
3. **Reversals:** if an invoice/payment is voided or refunded, create a negative/cancelling ledger entry; never delete ledger rows.
4. **Admin workflow:** review PENDING commissions, approve in bulk, create a payout (select distributor + period), mark as PAID with reference. Locked entries cannot be edited.
5. **Distributor view:** see only own commissions (pending, approved, paid), payout history, per-operator breakdown.
6. **Reports (tables, with CSV/Excel/PDF export hooks ready for Phase 5):** commission by distributor, by period, by operator, by plan; free-period connections showing "no commission – free period" so the exclusion is visible.
7. **Audit log** entries for approvals, payouts, rule changes.

## Tests
- Free connection → zero commission; same connection after auto conversion → commission on first paid invoice.
- Rule change after billing does not alter existing entries.
- Partial payment → proportional commission; refund → reversal.
- Operator under Distributor earns commission for the Distributor; direct Operator does not.
- Calculation is idempotent when the same payment event is replayed.

## Acceptance Criteria
- Ledger totals always reconcile with payments.
- Distributor cannot see another distributor's commissions.
- Admin can complete the full flow: payment → pending commission → approve → payout → paid.
