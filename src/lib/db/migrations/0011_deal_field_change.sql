CREATE TABLE "deal_field_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "deal_field_change" ADD CONSTRAINT "deal_field_change_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_field_change" ADD CONSTRAINT "deal_field_change_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_field_change_deal_idx" ON "deal_field_change" USING btree ("deal_id","changed_at");--> statement-breakpoint
CREATE INDEX "deal_field_change_at_idx" ON "deal_field_change" USING btree ("changed_at");