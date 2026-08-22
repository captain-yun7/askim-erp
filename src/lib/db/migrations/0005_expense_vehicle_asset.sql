-- 엑셀 매출장표(2026-08-19) 고정비에 (차량운반구) 과목 추가 — 통신비 다음, 차량유지비 앞
INSERT INTO "expense_category" ("code", "name_ko", "cost_group", "display_order")
VALUES ('vehicle_asset', '차량운반구', 'fixed', 15)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
UPDATE "expense_category" SET "display_order" = 16 WHERE "code" = 'vehicle';--> statement-breakpoint
UPDATE "expense_category" SET "display_order" = 17 WHERE "code" = 'insurance';--> statement-breakpoint
UPDATE "expense_category" SET "display_order" = 18 WHERE "code" = 'loan_interest';
