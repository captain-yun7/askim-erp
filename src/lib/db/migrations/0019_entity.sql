ALTER TABLE "deal" DROP CONSTRAINT "deal_deal_code_unique";--> statement-breakpoint
DROP INDEX "counterparty_business_no_uq";--> statement-breakpoint
DROP INDEX "expense_year_month_idx";--> statement-breakpoint
DROP INDEX "sales_target_year_group_uq";--> statement-breakpoint
ALTER TABLE "counterparty" ADD COLUMN "entity" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "entity" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
ALTER TABLE "deposit" ADD COLUMN "entity" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
ALTER TABLE "exclusive_contract" ADD COLUMN "entity" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "entity" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
ALTER TABLE "annual_plan" ADD COLUMN "entity" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_balance" ADD COLUMN "entity" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_target" ADD COLUMN "entity" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
-- annual_plan 기본키 year → (entity, year). 기본 이름 annual_plan_pkey (drizzle-kit 이 이름을 못 읽어 수동 기입)
ALTER TABLE "annual_plan" DROP CONSTRAINT "annual_plan_pkey";--> statement-breakpoint
ALTER TABLE "annual_plan" ADD CONSTRAINT "annual_plan_entity_year_pk" PRIMARY KEY("entity","year");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_entity_code_uq" ON "deal" USING btree ("entity","deal_code");--> statement-breakpoint
CREATE UNIQUE INDEX "counterparty_business_no_uq" ON "counterparty" USING btree ("entity","business_no") WHERE "counterparty"."business_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "expense_year_month_idx" ON "expense" USING btree ("entity","year","month","expense_category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_target_year_group_uq" ON "sales_target" USING btree ("entity","year","group_code");
