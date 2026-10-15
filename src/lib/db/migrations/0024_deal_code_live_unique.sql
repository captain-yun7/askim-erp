DROP INDEX "deal_entity_code_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "deal_entity_code_uq" ON "deal" USING btree ("entity","deal_code") WHERE "deal"."deleted_at" is null;