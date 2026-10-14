CREATE TABLE "deal_incentive_share" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "deal_incentive_share" ADD CONSTRAINT "deal_incentive_share_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_incentive_share" ADD CONSTRAINT "deal_incentive_share_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_incentive_share" ADD CONSTRAINT "deal_incentive_share_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_incentive_share_deal_user_uq" ON "deal_incentive_share" USING btree ("deal_id","user_id");