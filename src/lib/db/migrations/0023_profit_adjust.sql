ALTER TABLE "deal" ADD COLUMN "profit_adjusted" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "profit_adjust_memo" text;--> statement-breakpoint
ALTER TABLE "deal" drop column "profit";--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "profit" numeric(15, 2) GENERATED ALWAYS AS (coalesce(profit_adjusted, coalesce(sales_amount_net, 0) - coalesce(purchase_amount_net, 0))) STORED;
