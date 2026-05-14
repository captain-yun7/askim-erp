CREATE TYPE "public"."deal_status" AS ENUM('draft', 'confirmed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."paid_status" AS ENUM('pending', 'partial', 'completed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('corporate_card', 'personal_card', 'cash', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'accountant', 'sales', 'viewer');--> statement-breakpoint
CREATE TABLE "counterparty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"business_no" text,
	"ceo" text,
	"address" text,
	"business_type" text,
	"business_category" text,
	"phone" text,
	"email" text,
	"contact_person" text,
	"bank_account_raw" text,
	"account_holder" text,
	"official_fee_rate" text,
	"unofficial_fee_rate" text,
	"payment_term" text,
	"role_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"memo" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_code" text NOT NULL,
	"deal_code_base" text GENERATED ALWAYS AS (regexp_replace(deal_code, '-\d+$', '')) STORED,
	"accrual_year" integer NOT NULL,
	"accrual_month" integer NOT NULL,
	"owner_user_id" uuid,
	"category_id" integer,
	"account_id" integer,
	"currency" char(3) DEFAULT 'KRW' NOT NULL,
	"fx_rate" numeric(10, 4),
	"status" "deal_status" DEFAULT 'draft' NOT NULL,
	"sales_method_id" integer,
	"issuer_counterparty_id" uuid,
	"advertiser_counterparty_id" uuid,
	"item_name" text,
	"ad_start" date,
	"ad_end" date,
	"sales_amount_net" numeric(15, 2),
	"sales_vat" numeric(15, 2),
	"sales_amount_gross" numeric(15, 2),
	"sales_due_date" date,
	"sales_paid_date" date,
	"sales_paid_status" "paid_status" DEFAULT 'pending' NOT NULL,
	"sales_invoice_date" date,
	"sales_memo" text,
	"supplier_counterparty_id" uuid,
	"settlement_year" integer,
	"settlement_month" integer,
	"purchase_pricing_raw" text,
	"purchase_amount_net" numeric(15, 2),
	"purchase_vat" numeric(15, 2),
	"purchase_amount_gross" numeric(15, 2),
	"purchase_due_date" date,
	"purchase_paid_date" date,
	"purchase_paid_status" "paid_status" DEFAULT 'pending' NOT NULL,
	"purchase_invoice_date" date,
	"purchase_memo" text,
	"profit" numeric(15, 2) GENERATED ALWAYS AS (coalesce(sales_amount_net, 0) - coalesce(purchase_amount_net, 0)) STORED,
	"commission_pct" numeric(5, 4),
	"commission_amount" numeric(15, 2),
	"vat_filed" boolean DEFAULT false NOT NULL,
	"split_group" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "deal_deal_code_unique" UNIQUE("deal_code")
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_date" date NOT NULL,
	"year" integer GENERATED ALWAYS AS (extract(year from expense_date)::int) STORED,
	"month" integer GENERATED ALWAYS AS (extract(month from expense_date)::int) STORED,
	"item_name" text,
	"amount" numeric(15, 2) NOT NULL,
	"vat" numeric(15, 2),
	"counterparty_id" uuid,
	"counterparty_text" text,
	"expense_category_id" integer,
	"payment_method" "payment_method" DEFAULT 'corporate_card' NOT NULL,
	"payer_user_id" uuid,
	"memo" text,
	"receipt_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'sales' NOT NULL,
	"deal_code_prefix" text,
	"team" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ko" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "account_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "deal_category" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ko" text NOT NULL,
	"commission_rate" numeric(5, 4),
	"is_overseas" boolean DEFAULT false NOT NULL,
	"is_special_share" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"memo" text,
	CONSTRAINT "deal_category_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "expense_category" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ko" text NOT NULL,
	"is_fixed_cost" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "expense_category_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sales_method" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ko" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sales_method_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "counterparty" ADD CONSTRAINT "counterparty_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_category_id_deal_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."deal_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_sales_method_id_sales_method_id_fk" FOREIGN KEY ("sales_method_id") REFERENCES "public"."sales_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_issuer_counterparty_id_counterparty_id_fk" FOREIGN KEY ("issuer_counterparty_id") REFERENCES "public"."counterparty"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_advertiser_counterparty_id_counterparty_id_fk" FOREIGN KEY ("advertiser_counterparty_id") REFERENCES "public"."counterparty"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_supplier_counterparty_id_counterparty_id_fk" FOREIGN KEY ("supplier_counterparty_id") REFERENCES "public"."counterparty"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_counterparty_id_counterparty_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparty"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_expense_category_id_expense_category_id_fk" FOREIGN KEY ("expense_category_id") REFERENCES "public"."expense_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "counterparty_business_no_uq" ON "counterparty" USING btree ("business_no") WHERE "counterparty"."business_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "deal_accrual_idx" ON "deal" USING btree ("accrual_year","accrual_month");--> statement-breakpoint
CREATE INDEX "deal_sales_paid_idx" ON "deal" USING btree ("sales_paid_status","sales_due_date");--> statement-breakpoint
CREATE INDEX "deal_purchase_paid_idx" ON "deal" USING btree ("purchase_paid_status","purchase_due_date");--> statement-breakpoint
CREATE INDEX "deal_owner_idx" ON "deal" USING btree ("owner_user_id","accrual_year");--> statement-breakpoint
CREATE INDEX "deal_code_base_idx" ON "deal" USING btree ("deal_code_base");--> statement-breakpoint
CREATE INDEX "expense_year_month_idx" ON "expense" USING btree ("year","month","expense_category_id");--> statement-breakpoint
CREATE INDEX "expense_date_idx" ON "expense" USING btree ("expense_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_deal_code_prefix_uq" ON "users" USING btree ("deal_code_prefix") WHERE "users"."deal_code_prefix" IS NOT NULL;