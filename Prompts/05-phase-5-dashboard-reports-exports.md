# CATV – Phase 5 of 7: Dashboard, Reports and Exports

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

## Phase 5 Goal
Build the **high-end golden dashboard**, funnels, charts, and tabular reports, all exportable as **CSV, Excel and PDF**.

## Tasks
1. **Reporting API:** aggregate endpoints with date range and filters (distributor, operator, status, activation type, plan). All results automatically respect the actor's data scope. Add DB indexes and, where needed, materialised views or cached aggregates (Redis) so dashboards load fast.
2. **Dashboard (role-aware):**
   - **KPI cards:** total connections, pending activations, active paid, active free, free periods expiring (next 7 / 30 days), revenue (today / month), outstanding dues, commission payable.
   - **Funnel (ECharts):** Published → Pending Activation → Active Free → Active Paid.
   - **Charts:** revenue trend, new connections trend, collection vs outstanding, distributor leaderboard, operator performance, free-to-paid conversion rate, churn, status distribution donut, activity heatmap.
   - Date range picker with presets, filter bar, drill-down from any chart to the matching table.
   - Admin sees everything; Distributor sees own subtree; Operator sees own customers; Customer sees a simple personal summary.
3. **Tabular reports** (TanStack Table, server-side pagination/sort/filter, column visibility, saved filters): users, connections, activations, free-period tracker, invoices, payments, outstanding dues, commissions, payouts, audit log. Custom attributes must be available as columns and filters.
4. **Exports on every report and table** (button group: CSV, Excel, PDF):
   - Exports honour current filters, sort and the user's data scope.
   - **CSV:** streamed. **Excel:** ExcelJS with styled gold header row, auto column width, frozen header, number/date formats. **PDF:** pdfmake with golden branded header, title, filter summary, page numbers, totals row.
   - Large exports run as **background jobs** with a progress state and a download link; small ones download immediately. Cap and clean up temp files.
   - Audit log entry for every export.
5. **UI polish:** premium gold look, soft gradients, subtle glow on active elements, skeleton loaders, empty states, responsive layout, dark/light mode, ECharts using the registered gold theme, chart tooltips and legends accessible.

## Tests
- Distributor's dashboard numbers equal the sum from their subtree only.
- Export row count matches the filtered table count for all three formats.
- Free-expiring widget lists the correct connections.

## Acceptance Criteria
- Dashboard loads in under ~2 seconds on seeded data (state how you measured it).
- Every table has working CSV, Excel and PDF exports.
- No report ever leaks data outside the actor's scope.
