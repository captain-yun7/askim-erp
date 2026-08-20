ALTER TABLE "expense_category" ADD COLUMN "cost_group" text DEFAULT 'variable' NOT NULL;--> statement-breakpoint
UPDATE "expense_category" SET "cost_group" = CASE WHEN "is_fixed_cost" THEN 'fixed' ELSE 'variable' END;--> statement-breakpoint
-- 엑셀 '매출장표' 과목 체계로 재편: 고정비 17 · 변동비 8 · 판관비 외(세금)
INSERT INTO "expense_category" ("code", "name_ko", "cost_group", "display_order") VALUES
  ('general_supplies', '일반소모품비', 'fixed', 2),
  ('fuel',             '주유비',       'fixed', 11),
  ('vehicle',          '차량유지비',   'fixed', 15),
  ('insurance',        '보험비',       'fixed', 16),
  ('other_ops',        '기타운영비',   'variable', 18),
  ('tax',              '세금',         'non_operating', 30)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
UPDATE "expense_category" AS ec SET "cost_group" = v.grp, "display_order" = v.ord FROM (VALUES
  ('labor', 'fixed', 1), ('meals', 'fixed', 3), ('office_supplies', 'fixed', 4), ('utility', 'fixed', 5),
  ('transport', 'fixed', 6), ('postage', 'fixed', 7), ('cargo', 'fixed', 8), ('education', 'fixed', 9),
  ('donation', 'fixed', 10), ('commission_fee', 'fixed', 12), ('office_rent', 'fixed', 13),
  ('communication', 'fixed', 14), ('loan_interest', 'fixed', 17),
  ('books_print', 'variable', 19), ('marketing', 'variable', 20), ('welfare', 'variable', 21),
  ('external_labor', 'variable', 22), ('outsourcing', 'variable', 23), ('entertainment', 'variable', 24),
  ('travel', 'variable', 25)
) AS v(code, grp, ord) WHERE ec."code" = v.code;--> statement-breakpoint
UPDATE "expense_category" SET "name_ko" = '기타(판관비 외)', "cost_group" = 'excluded', "display_order" = 40 WHERE "code" = 'other_var';--> statement-breakpoint
-- 기타로 들어갔던 건을 품목명 접두어로 재분류
UPDATE "expense" e SET "expense_category_id" = ec.id
FROM "expense_category" ec
WHERE e."expense_category_id" = (SELECT id FROM "expense_category" WHERE code = 'other_var')
  AND ec.code = CASE
    WHEN e.item_name LIKE '세금%' THEN 'tax'
    WHEN e.item_name LIKE '보험비%' THEN 'insurance'
    WHEN e.item_name LIKE '주유비%' THEN 'fuel'
    WHEN e.item_name LIKE '차량유지비%' THEN 'vehicle'
    WHEN e.item_name LIKE '기타운영비%' THEN 'other_ops'
    WHEN e.item_name LIKE '일반소모품비%' THEN 'general_supplies'
  END;--> statement-breakpoint
-- 엑셀은 4대보험료를 (인건비)에 합산 — 미사용 과목 제거
DELETE FROM "expense_category" WHERE "code" = 'social_insurance'
  AND NOT EXISTS (SELECT 1 FROM "expense" WHERE "expense_category_id" = "expense_category"."id");
