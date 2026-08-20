CREATE TABLE "annual_plan" (
	"year" integer PRIMARY KEY NOT NULL,
	"annual_sales_target" numeric(18, 2),
	"cash_as_of" date,
	"fx_rate_usd" numeric(10, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "cash_balance" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"label" text NOT NULL,
	"amount_krw" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_fx" numeric(18, 2),
	"fx_currency" text,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_target" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"group_code" text NOT NULL,
	"priority" text,
	"target_amount" numeric(18, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_category" ADD COLUMN "plan_group" text;--> statement-breakpoint
ALTER TABLE "annual_plan" ADD CONSTRAINT "annual_plan_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_target_year_group_uq" ON "sales_target" USING btree ("year","group_code");
--> statement-breakpoint
-- 상품구분 → 매출목표 그룹 (엑셀 26년 plan SUMIFS 조건 그대로)
UPDATE "deal_category" AS dc SET "plan_group" = v.grp FROM (VALUES
  ('exclusive_self', 'exclusive'),
  ('outwall_self_seongsu', 'outwall_seongsu'), ('outwall_share_seongsu', 'outwall_seongsu'),
  ('outwall_self_other', 'outwall_other'),     ('outwall_share_other', 'outwall_other'),
  ('han_river_bus', 'han_river_bus'),
  ('overseas', 'overseas'),
  ('sales_agency', 'sales_agency'),
  ('fanclub_self', 'fanclub'), ('fanclub_agency', 'fanclub'),
  ('china_biz', 'china')
) AS v(code, grp) WHERE dc."code" = v.code;--> statement-breakpoint
-- 2026 초기값: 엑셀 26년 plan (2026-05-12 기준) 목표·우선순위
INSERT INTO "sales_target" ("year", "group_code", "priority", "target_amount") VALUES
  (2026, 'exclusive', '중', 0),
  (2026, 'outwall_seongsu', '상', 3300000000),
  (2026, 'outwall_other', '중', 500000000),
  (2026, 'han_river_bus', '중', 3000000000),
  (2026, 'overseas', '상', 1500000000),
  (2026, 'sales_agency', '하', 2000000000),
  (2026, 'fanclub', '하', 300000000),
  (2026, 'china', '상', 3000000000)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "annual_plan" ("year", "annual_sales_target") VALUES (2026, 8800000000) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "cash_balance" ("year", "label", "amount_krw", "amount_fx", "fx_currency", "display_order") VALUES
  (2026, '입출금 계좌', 0, NULL, NULL, 1),
  (2026, '급여계좌', 0, NULL, NULL, 2),
  (2026, '소매업 계좌', 0, NULL, NULL, 3),
  (2026, '중사부(원화)', 0, NULL, NULL, 4),
  (2026, '외화통장', 0, 0, 'USD', 5),
  (2026, '중사부(외화)', 0, 0, 'USD', 6);
