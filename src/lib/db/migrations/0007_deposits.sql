CREATE TABLE "deposit" (
	"id" serial PRIMARY KEY NOT NULL,
	"counterparty_name" text NOT NULL,
	"counterparty_id" uuid,
	"description" text,
	"owner_name" text,
	"owner_user_id" uuid,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"paid_date" date,
	"returned_date" date,
	"status" text DEFAULT 'held' NOT NULL,
	"memo" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exclusive_contract" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_name" text NOT NULL,
	"media_type" text,
	"owner_name" text,
	"owner_user_id" uuid,
	"contract_period" text,
	"contract_terms" text,
	"has_monthly_fee" text,
	"deposit_paid_date" date,
	"deposit_returned_date" date,
	"memo" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_counterparty_id_counterparty_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparty"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusive_contract" ADD CONSTRAINT "exclusive_contract_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;