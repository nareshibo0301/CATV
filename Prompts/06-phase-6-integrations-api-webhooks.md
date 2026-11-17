# CATV – Phase 6 of 7: Integrations (API, Webhooks)

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

## Phase 6 Goal
Make CATV integration-ready: **inbound API, outbound API, inbound webhooks and outbound webhooks**.

## Tasks
### A. Inbound API
1. Versioned REST API under `/api/v1` with full OpenAPI docs.
2. **API keys:** Admin creates keys with a name, **scopes** (e.g. `users:read`, `connections:write`, `payments:write`, `invoices:read`), optional IP allowlist, per-key rate limit, expiry. Show the secret **once**, store only a hash. Rotate and revoke supported. Keys act within an assigned data scope.
3. **Idempotency keys** on all create endpoints (`Idempotency-Key` header, stored response replay).
4. Usage log per key (endpoint, status, time) with an Admin view.

### B. Inbound Webhooks
1. Endpoint(s) such as `/api/v1/webhooks/inbound/:provider` (e.g. payment gateway callbacks).
2. **Verify HMAC signature** and a timestamp tolerance to block replays; reject on failure.
3. Store the **raw payload** first, respond fast (2xx), then process **asynchronously** via BullMQ. Deduplicate by event ID.
4. Inbound payment events must create Payments through the same service used by the UI (so Phase 4 commission triggers automatically).

### C. Outbound Webhooks
1. Admin registers endpoint URLs, secret, and **subscribed events**. Minimum events: `user.created`, `user.updated`, `connection.published`, `connection.activated`, `connection.free_started`, `connection.free_expired`, `connection.converted_to_paid`, `invoice.created`, `payment.received`, `commission.created`, `commission.paid`.
2. Emit events from a central domain-event bus (no scattered ad hoc calls).
3. Sign every delivery: `X-CATV-Signature` (HMAC-SHA256), `X-CATV-Timestamp`, `X-CATV-Event-Id`.
4. Deliver through a queue with **exponential backoff retries**, max attempts, then dead-letter. Auto-disable an endpoint after repeated failures with an Admin alert.
5. **Delivery log UI:** request/response, status, attempts, latency, **manual re-send**, and a "send test event" button.

### D. Outbound API Connector Layer
1. Define an `IntegrationAdapter` interface (init, send, healthCheck) so CATV can call external services (SMS/WhatsApp, payment gateway, external billing/ERP).
2. Shared HTTP client with timeouts, retries, circuit breaker, and request/response logging with secrets redacted.
3. Ship a **stub adapter** and **one example adapter** (generic SMS over HTTP) configurable from an Admin Integrations screen; credentials encrypted at rest.

### E. Frontend
Admin screens: API Keys, Webhook Endpoints, Delivery Logs, Integrations, API usage. Include copyable curl examples and a link to the Swagger docs.

## Tests
- Invalid signature and replayed timestamp are rejected.
- Duplicate inbound event processed exactly once.
- Outbound retry/backoff and dead-letter behave as configured.
- API key without the right scope gets 403; revoked key gets 401.

## Acceptance Criteria
- A sample external system can create a connection and record a payment via API key, and receive the resulting webhooks with valid signatures.
- Nothing is delivered or processed twice.
