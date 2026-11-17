-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "user_code" TEXT;
ALTER TABLE "users" ADD COLUMN "custom_data" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "users_user_code_key" ON "users"("user_code");
CREATE INDEX "users_custom_data_gin" ON "users" USING GIN ("custom_data");

-- CreateTable
CREATE TABLE "id_sequences" (
    "role" "Role" NOT NULL,
    "prefix" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 5,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "id_sequences_pkey" PRIMARY KEY ("role")
);

CREATE UNIQUE INDEX "id_sequences_prefix_key" ON "id_sequences"("prefix");

ALTER TABLE "id_sequences" ADD CONSTRAINT "id_sequences_role_check" CHECK ("role" IN ('DISTRIBUTOR', 'OPERATOR', 'CUSTOMER'));

INSERT INTO "id_sequences" ("role", "prefix", "padding", "next_value", "updated_at") VALUES
('DISTRIBUTOR', 'DST', 5, 1, CURRENT_TIMESTAMP),
('OPERATOR', 'OPR', 5, 1, CURRENT_TIMESTAMP),
('CUSTOMER', 'CUS', 5, 1, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "attribute_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data_type" "AttributeDataType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "applicable_roles" "Role"[] NOT NULL,
    "target_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attribute_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attribute_definitions_key_active" ON "attribute_definitions"("key") WHERE "deleted_at" IS NULL;
CREATE INDEX "attribute_definitions_target_user_id_idx" ON "attribute_definitions"("target_user_id");
CREATE INDEX "attribute_definitions_deleted_at_idx" ON "attribute_definitions"("deleted_at");

ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "CommissionType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_rules_user_id_effective_from_idx" ON "commission_rules"("user_id", "effective_from");

ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
