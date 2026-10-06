CREATE TABLE "employee" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" text,
	"birth_code" text,
	"department" text,
	"hire_date" date,
	"annual_salary" numeric(15, 0),
	"monthly_salary" numeric(15, 0),
	"incentive" text,
	"leave_date" date,
	"pension_year" integer,
	"memo" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
