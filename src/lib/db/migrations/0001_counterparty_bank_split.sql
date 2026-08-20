ALTER TABLE "counterparty" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "counterparty" ADD COLUMN "account_no" text;
--> statement-breakpoint
-- 기존 bank_account_raw("100-000-424857 (신한)", "신한은행 100-…", "110-… 신한 공동주" 등)에서 은행명/계좌번호 분리
UPDATE "counterparty"
SET
  "bank_name" = COALESCE(
    NULLIF(substring("bank_account_raw" from '\(([^)]+)\)'), ''),
    CASE WHEN "bank_account_raw" ~ '[0-9]{3,}'
         THEN NULLIF(substring(regexp_replace("bank_account_raw", '\([^)]*\)', '', 'g') from '([A-Za-z가-힣]+)'), '')
    END
  ),
  "account_no" = COALESCE(
    NULLIF(substring("bank_account_raw" from '[0-9][0-9 -]*[0-9]'), ''),
    "bank_account_raw"
  )
WHERE "bank_account_raw" IS NOT NULL AND "account_no" IS NULL;
