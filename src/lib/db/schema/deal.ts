import { sql } from 'drizzle-orm'
import {
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
    dealCode: text('deal_code').notNull().unique(),
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
    status: dealStatusEnum('status').notNull().default('draft'),

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
    profit: numeric('profit', { precision: 15, scale: 2 }).generatedAlwaysAs(
      sql`coalesce(sales_amount_net, 0) - coalesce(purchase_amount_net, 0)`,
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
    index('deal_accrual_idx').on(t.accrualYear, t.accrualMonth),
    index('deal_sales_paid_idx').on(t.salesPaidStatus, t.salesDueDate),
    index('deal_purchase_paid_idx').on(t.purchasePaidStatus, t.purchaseDueDate),
    index('deal_owner_idx').on(t.ownerUserId, t.accrualYear),
    index('deal_code_base_idx').on(t.dealCodeBase),
  ],
)

export type Deal = typeof deal.$inferSelect
export type NewDeal = typeof deal.$inferInsert
