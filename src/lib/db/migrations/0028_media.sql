CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text DEFAULT 'kr' NOT NULL,
	"code" text NOT NULL,
	"category" text,
	"region_city" text,
	"region_district" text,
	"region_area" text,
	"name" text NOT NULL,
	"name_original" text,
	"contract_type" text,
	"contract_start" date,
	"contract_end" date,
	"contract_note" text,
	"staff_note" text,
	"run_period" text,
	"status" text DEFAULT '운영 중' NOT NULL,
	"memo" text,
	"source" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "media_contact" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_id" integer NOT NULL,
	"name" text,
	"title" text,
	"company" text,
	"phone" text,
	"phone2" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_option" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text DEFAULT 'kr' NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"parent_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_price" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_id" integer NOT NULL,
	"type" text NOT NULL,
	"label" text,
	"amount" numeric(15, 0),
	"approx" boolean DEFAULT false NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_staff" (
	"media_id" integer NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_vendor" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_id" integer NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_contact" ADD CONSTRAINT "media_contact_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_price" ADD CONSTRAINT "media_price_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_staff" ADD CONSTRAINT "media_staff_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_staff" ADD CONSTRAINT "media_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_vendor" ADD CONSTRAINT "media_vendor_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_code_uq" ON "media" USING btree ("entity","code") WHERE "media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "media_contact_media_idx" ON "media_contact" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_option_uq" ON "media_option" USING btree ("entity","kind","value",coalesce("parent_id", 0));--> statement-breakpoint
CREATE INDEX "media_price_media_idx" ON "media_price" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_staff_uq" ON "media_staff" USING btree ("media_id","user_id");--> statement-breakpoint
CREATE INDEX "media_vendor_media_idx" ON "media_vendor" USING btree ("media_id");