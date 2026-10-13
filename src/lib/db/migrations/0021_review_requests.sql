CREATE TABLE "review_count_adjust" (
	"entity" text DEFAULT 'kr' NOT NULL,
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"delta" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "review_count_adjust_entity_user_id_year_month_pk" PRIMARY KEY("entity","user_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "review_request_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text DEFAULT 'kr' NOT NULL,
	"deal_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_count_adjust" ADD CONSTRAINT "review_count_adjust_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_count_adjust" ADD CONSTRAINT "review_count_adjust_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request_log" ADD CONSTRAINT "review_request_log_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request_log" ADD CONSTRAINT "review_request_log_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request_log" ADD CONSTRAINT "review_request_log_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_request_log_month_idx" ON "review_request_log" USING btree ("entity","requested_at");--> statement-breakpoint
CREATE INDEX "review_request_log_deal_idx" ON "review_request_log" USING btree ("deal_id");--> statement-breakpoint
-- 기존 수정요청 표시 이력(감사 로그)을 기록으로 옮긴다 — 10/8 기능 배포 뒤 걸린 수정요청도 횟수에 포함
INSERT INTO "review_request_log" ("entity", "deal_id", "owner_user_id", "requested_by", "requested_at")
SELECT d."entity", d."id", d."owner_user_id", u."id", a."at"
FROM "audit_log" a
JOIN "deal" d ON d."id"::text = a."target_id"
LEFT JOIN "users" u ON u."id" = a."user_id"
WHERE a."action" = 'deal.inline' AND a."detail"->'reviewStatus'->>1 = 'requested';
