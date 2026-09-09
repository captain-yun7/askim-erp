ALTER TABLE "deal" ADD COLUMN "advertiser_name" text;--> statement-breakpoint
UPDATE "deal" d SET "advertiser_name" = c."name" FROM "counterparty" c WHERE d."advertiser_counterparty_id" = c."id" AND d."advertiser_name" IS NULL;
