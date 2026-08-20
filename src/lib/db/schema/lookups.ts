import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
} from 'drizzle-orm/pg-core'

// 상품구분 (15종) — 인센티브 룰의 핵심 기준
export const dealCategory = pgTable('deal_category', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameKo: text('name_ko').notNull(),
  commissionRate: numeric('commission_rate', { precision: 5, scale: 4 }),
  isOverseas: boolean('is_overseas').notNull().default(false),
  isSpecialShare: text('is_special_share'),
  displayOrder: integer('display_order').notNull().default(0),
  memo: text('memo'),
  // 매출목표 그룹 (src/lib/plan-groups.ts) — 목표 달성률 집계 단위
  planGroup: text('plan_group'),
})

// 계정항목 (광고비/제작비/보증금/등)
export const account = pgTable('account', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameKo: text('name_ko').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
})

// 매출수단 (세금계산서/현금영수증/카드/알리페이/계좌이체)
export const salesMethod = pgTable('sales_method', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameKo: text('name_ko').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
})

// 거래항목 (판관비 — 식대/교통/지급수수료 등)
// costGroup: fixed(고정비) | variable(변동비) | non_operating(판관비 외, 세금 → 당기순이익 차감) | excluded(리포트 제외)
export const expenseCategory = pgTable('expense_category', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameKo: text('name_ko').notNull(),
  costGroup: text('cost_group', { enum: ['fixed', 'variable', 'non_operating', 'excluded'] })
    .notNull()
    .default('variable'),
  displayOrder: integer('display_order').notNull().default(0),
})

export type DealCategory = typeof dealCategory.$inferSelect
export type Account = typeof account.$inferSelect
export type SalesMethod = typeof salesMethod.$inferSelect
export type ExpenseCategory = typeof expenseCategory.$inferSelect
