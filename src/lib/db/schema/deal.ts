import { sql } from 'drizzle-orm'
import {
  uniqueIndex,
  boolean,
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { counterparty } from './counterparty'
import { dealStatusEnum, paidStatusEnum } from './enums'
import { account, dealCategory, salesMethod } from './lookups'
import { users } from './users'

export const deal = pgTable(
  'deal',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // 식별
    // 거래코드는 법인 안에서만 유일 (미국법인 시트에 한국과 같은 코드가 있음) — uniqueIndex 참조
    dealCode: text('deal_code').notNull(),
    dealCodeBase: text('deal_code_base').generatedAlwaysAs(
      sql`regexp_replace(deal_code, '-\\d+$', '')`,
    ),

    // 귀속/분류
    accrualYear: integer('accrual_year').notNull(),
    accrualMonth: integer('accrual_month').notNull(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    categoryId: integer('category_id').references(() => dealCategory.id),
    accountId: integer('account_id').references(() => account.id),
    currency: char('currency', { length: 3 }).notNull().default('KRW'),
    fxRate: numeric('fx_rate', { precision: 10, scale: 4 }),
    // 법인 (2026-10-08 요청: 한국/미국/중국 분리) — 'kr' | 'us' | 'cn'
    entity: text('entity').notNull().default('kr'),
    status: dealStatusEnum('status').notNull().default('draft'),
    // 수정요청/완료 표시 (2026-10-08 요청): null → 'requested'(빨강) → 'done'(초록) → null 순환
    reviewStatus: text('review_status', { enum: ['requested', 'done'] }),

    // ── 매출 (Sales) ──────────────────────────
    salesMethodId: integer('sales_method_id').references(() => salesMethod.id),
    issuerCounterpartyId: uuid('issuer_counterparty_id').references(
      () => counterparty.id,
    ),
    /** @deprecated 2026-09-09 부터 advertiserName 자유 입력 사용. 기존 데이터 참조용으로만 유지 */
    advertiserCounterpartyId: uuid('advertiser_counterparty_id').references(
      () => counterparty.id,
    ),
    /** 실광고주 — 자유 텍스트 (2026-09-09 피드백: 검색 대신 수기 입력) */
    advertiserName: text('advertiser_name'),
    itemName: text('item_name'),
    adStart: date('ad_start'),
    adEnd: date('ad_end'),
    salesAmountNet: numeric('sales_amount_net', { precision: 15, scale: 2 }),
    salesVat: numeric('sales_vat', { precision: 15, scale: 2 }),
    salesAmountGross: numeric('sales_amount_gross', { precision: 15, scale: 2 }),
    salesDueDate: date('sales_due_date'),
    salesPaidDate: date('sales_paid_date'),
    salesPaidStatus: paidStatusEnum('sales_paid_status').notNull().default('pending'),
    salesInvoiceDate: date('sales_invoice_date'),
    salesMemo: text('sales_memo'),

    // ── 매입 (Purchase) ──────────────────────
    supplierCounterpartyId: uuid('supplier_counterparty_id').references(
      () => counterparty.id,
    ),
    settlementYear: integer('settlement_year'),
    settlementMonth: integer('settlement_month'),
    purchasePricingRaw: text('purchase_pricing_raw'),
    purchaseAmountNet: numeric('purchase_amount_net', { precision: 15, scale: 2 }),
    purchaseVat: numeric('purchase_vat', { precision: 15, scale: 2 }),
    purchaseAmountGross: numeric('purchase_amount_gross', {
      precision: 15,
      scale: 2,
    }),
    purchaseDueDate: date('purchase_due_date'),
    purchasePaidDate: date('purchase_paid_date'),
    purchasePaidStatus: paidStatusEnum('purchase_paid_status')
      .notNull()
      .default('pending'),
    purchaseInvoiceDate: date('purchase_invoice_date'),
    purchaseMemo: text('purchase_memo'),

    // ── 계산 ──────────────────────────────────
    // 손익 수동 조정 (2026-10-15 요청): 넣으면 매출−매입 대신 이 값이 손익 — 성과급·리포트 모두 profit 하나만 본다
    profitAdjusted: numeric('profit_adjusted', { precision: 15, scale: 2 }),
    profitAdjustMemo: text('profit_adjust_memo'),
    profit: numeric('profit', { precision: 15, scale: 2 }).generatedAlwaysAs(
      sql`coalesce(profit_adjusted, coalesce(sales_amount_net, 0) - coalesce(purchase_amount_net, 0))`,
    ),
    commissionPct: numeric('commission_pct', { precision: 5, scale: 4 }),
    commissionAmount: numeric('commission_amount', { precision: 15, scale: 2 }),

    // ── 메타 ──────────────────────────────────
    vatFiled: boolean('vat_filed').notNull().default(false),
    splitGroup: text('split_group'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    // 삭제한 거래의 코드는 다시 쓸 수 있게 살아 있는 거래끼리만 (2026-10-15: 삭제 직후 같은 코드로 등록이 막힘)
    uniqueIndex('deal_entity_code_uq').on(t.entity, t.dealCode).where(sql`${t.deletedAt} is null`),
    index('deal_accrual_idx').on(t.accrualYear, t.accrualMonth),
    index('deal_sales_paid_idx').on(t.salesPaidStatus, t.salesDueDate),
    index('deal_purchase_paid_idx').on(t.purchasePaidStatus, t.purchaseDueDate),
    index('deal_owner_idx').on(t.ownerUserId, t.accrualYear),
    index('deal_code_base_idx').on(t.dealCodeBase),
    // 2026-10-09 성능: 기본 정렬(작성순)·거래처 필터·결산연월 집계용 부분 인덱스 (삭제되지 않은 행만)
    index('deal_live_created_idx').on(t.entity, t.createdAt, t.id).where(sql`${t.deletedAt} is null`),
    index('deal_supplier_idx').on(t.supplierCounterpartyId).where(sql`${t.deletedAt} is null`),
    index('deal_issuer_idx').on(t.issuerCounterpartyId).where(sql`${t.deletedAt} is null`),
    index('deal_settlement_idx').on(t.settlementYear, t.settlementMonth).where(sql`${t.deletedAt} is null`),
  ],
)

export type Deal = typeof deal.$inferSelect
export type NewDeal = typeof deal.$inferInsert
