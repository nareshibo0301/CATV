# CATV documentation

CATV is a cable-network platform for a private server. Roles are Admin (Developer, Super Admin, and Admin — equal access), Distributor, Operator, and Customer.

- [Architecture](architecture.md)
- [Permissions](permissions.md)
- [Business rules](business-rules.md)
- [API and webhooks](api-and-webhooks.md)
- [Deployment and backups](deployment.md)
- [QA checklist](qa-checklist.md)

Local stack: `docker compose up --build -d` from the repo root, then open http://localhost:8080. Seeded admin: `admin@catv.local` / `ChangeMeNow!123`.

Demo connections and invoices: `pnpm --filter @catv/api exec tsx prisma/demo-seed.ts`. Add `--demo` only after more customers exist; the default pass uses the customers already seeded.
