CREATE INDEX "deal_live_created_idx" ON "deal" USING btree ("entity","created_at","id") WHERE "deal"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "deal_supplier_idx" ON "deal" USING btree ("supplier_counterparty_id") WHERE "deal"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "deal_issuer_idx" ON "deal" USING btree ("issuer_counterparty_id") WHERE "deal"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "deal_settlement_idx" ON "deal" USING btree ("settlement_year","settlement_month") WHERE "deal"."deleted_at" is null;