-- Phase 3–6: connections, billing, commission ledger, integrations.

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE_PAID', 'ACTIVE_FREE', 'SUSPENDED', 'DISCONNECTED');
CREATE TYPE "ActivationType" AS ENUM ('PAID', 'FREE');
CREATE TYPE "FreeReason" AS ENUM ('INITIAL_OFFER', 'LOYALTY_OFFER', 'OTHER');
CREATE TYPE "InvoiceKind" AS ENUM ('ACTIVATION', 'RECURRING');
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'DEAD');

CREATE TABLE "plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "billing_cycle" "BillingCycle" NOT NULL,
  "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "published_by_id" UUID NOT NULL,
  "distributor_id" UUID,
  "operator_id" UUID,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
  "activation_type" "ActivationType",
  "free_start_date" TIMESTAMP(3),
  "free_end_date" TIMESTAMP(3),
  "free_reason" "FreeReason",
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connection_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL,
  "from_status" "ConnectionStatus",
  "to_status" "ConnectionStatus" NOT NULL,
  "reason" TEXT,
  "actor_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connection_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "free_periods" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "duration_label" TEXT NOT NULL,
  "reason" "FreeReason" NOT NULL,
  "granted_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "free_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_sequences" (
  "name" TEXT NOT NULL,
  "next_value" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("name")
);

INSERT INTO "document_sequences" ("name", "next_value") VALUES ('invoice', 1);

CREATE TABLE "invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "number" TEXT NOT NULL,
  "source_key" TEXT,
  "connection_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "distributor_id" UUID,
  "operator_id" UUID,
  "kind" "InvoiceKind" NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "tax" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMP(3) NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "reference" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recorded_by_id" UUID,
  "voided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commission_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_key" TEXT NOT NULL,
  "distributor_id" UUID NOT NULL,
  "operator_id" UUID,
  "connection_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "payment_id" UUID,
  "reversal_of_id" UUID,
  "base_amount" DECIMAL(12,2) NOT NULL,
  "rule_type" "CommissionType" NOT NULL,
  "rule_value" DECIMAL(12,2) NOT NULL,
  "commission_amount" DECIMAL(12,2) NOT NULL,
  "status" "LedgerStatus" NOT NULL DEFAULT 'PENDING',
  "payout_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payouts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "distributor_id" UUID NOT NULL,
  "period" TEXT NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_by_id" UUID,
  CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "ip_allowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "scope_user_id" UUID NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_usage_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "api_key_id" UUID NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "status" INTEGER NOT NULL,
  "ms" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_key" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "body" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbound_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inbound_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_endpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "url" TEXT NOT NULL,
  "secret_cipher" TEXT NOT NULL,
  "events" TEXT[] NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "disabled_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "endpoint_id" UUID NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_status_code" INTEGER,
  "last_error" TEXT,
  "latency_ms" INTEGER,
  "response_body" TEXT,
  "next_attempt_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integrations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "config_cipher" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saved_report_filters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "report" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_report_filters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "export_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "report" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "file_path" TEXT,
  "error" TEXT,
  "filters" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE UNIQUE INDEX "invoices_source_key_key" ON "invoices"("source_key");
CREATE UNIQUE INDEX "commission_ledger_source_key_key" ON "commission_ledger"("source_key");
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE UNIQUE INDEX "idempotency_records_actor_key_method_path_idempotency_key_key" ON "idempotency_records"("actor_key", "method", "path", "idempotency_key");
CREATE UNIQUE INDEX "inbound_webhook_events_provider_event_id_key" ON "inbound_webhook_events"("provider", "event_id");

CREATE INDEX "connections_customer_id_idx" ON "connections"("customer_id");
CREATE INDEX "connections_distributor_id_idx" ON "connections"("distributor_id");
CREATE INDEX "connections_operator_id_idx" ON "connections"("operator_id");
CREATE INDEX "connections_status_idx" ON "connections"("status");
CREATE INDEX "connections_free_end_date_idx" ON "connections"("free_end_date");
CREATE INDEX "connections_status_free_end_date_idx" ON "connections"("status", "free_end_date");
CREATE INDEX "connections_created_at_idx" ON "connections"("created_at");
CREATE INDEX "connection_status_history_connection_id_created_at_idx" ON "connection_status_history"("connection_id", "created_at");
CREATE INDEX "free_periods_connection_id_idx" ON "free_periods"("connection_id");
CREATE INDEX "free_periods_end_date_idx" ON "free_periods"("end_date");
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");
CREATE INDEX "invoices_distributor_id_idx" ON "invoices"("distributor_id");
CREATE INDEX "invoices_connection_id_idx" ON "invoices"("connection_id");
CREATE INDEX "invoices_status_due_at_idx" ON "invoices"("status", "due_at");
CREATE INDEX "invoices_issued_at_idx" ON "invoices"("issued_at");
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");
CREATE INDEX "payments_received_at_idx" ON "payments"("received_at");
CREATE INDEX "commission_ledger_distributor_id_status_idx" ON "commission_ledger"("distributor_id", "status");
CREATE INDEX "commission_ledger_operator_id_idx" ON "commission_ledger"("operator_id");
CREATE INDEX "commission_ledger_invoice_id_idx" ON "commission_ledger"("invoice_id");
CREATE INDEX "commission_ledger_payment_id_idx" ON "commission_ledger"("payment_id");
CREATE INDEX "commission_ledger_created_at_idx" ON "commission_ledger"("created_at");
CREATE INDEX "payouts_distributor_id_period_idx" ON "payouts"("distributor_id", "period");
CREATE INDEX "api_keys_scope_user_id_idx" ON "api_keys"("scope_user_id");
CREATE INDEX "api_usage_logs_api_key_id_created_at_idx" ON "api_usage_logs"("api_key_id", "created_at");
CREATE INDEX "webhook_deliveries_endpoint_id_created_at_idx" ON "webhook_deliveries"("endpoint_id", "created_at");
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");
CREATE INDEX "saved_report_filters_user_id_report_idx" ON "saved_report_filters"("user_id", "report");
CREATE INDEX "export_jobs_user_id_created_at_idx" ON "export_jobs"("user_id", "created_at");

ALTER TABLE "connections" ADD CONSTRAINT "connections_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connections" ADD CONSTRAINT "connections_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connections" ADD CONSTRAINT "connections_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connections" ADD CONSTRAINT "connections_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connections" ADD CONSTRAINT "connections_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connection_status_history" ADD CONSTRAINT "connection_status_history_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connection_status_history" ADD CONSTRAINT "connection_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "free_periods" ADD CONSTRAINT "free_periods_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "free_periods" ADD CONSTRAINT "free_periods_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "commission_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_scope_user_id_fkey" FOREIGN KEY ("scope_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "saved_report_filters" ADD CONSTRAINT "saved_report_filters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
