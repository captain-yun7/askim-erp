import {
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './users'

// 연간 계획 설정 — 월별 수금결산의 연 목표매출, 현금흐름 기준일/환율
export const annualPlan = pgTable('annual_plan', {
  year: integer('year').primaryKey(),
  annualSalesTarget: numeric('annual_sales_target', { precision: 18, scale: 2 }),
  cashAsOf: date('cash_as_of'),
  fxRateUsd: numeric('fx_rate_usd', { precision: 10, scale: 2 }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

// 상품군별 매출목표 (엑셀 '26년 plan' 상단 표) — VAT 제외
export const salesTarget = pgTable(
  'sales_target',
  {
    id: serial('id').primaryKey(),
    year: integer('year').notNull(),
    groupCode: text('group_code').notNull(),
    priority: text('priority'),
    targetAmount: numeric('target_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  },
  (t) => [uniqueIndex('sales_target_year_group_uq').on(t.year, t.groupCode)],
)

// 계좌 잔액 현황 (엑셀 '26년 plan' 현금흐름 표) — 회계담당 수기 입력, VAT 포함
export const cashBalance = pgTable('cash_balance', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(),
  label: text('label').notNull(),
  amountKrw: numeric('amount_krw', { precision: 18, scale: 2 }).notNull().default('0'),
  amountFx: numeric('amount_fx', { precision: 18, scale: 2 }),
  fxCurrency: text('fx_currency'),
  displayOrder: integer('display_order').notNull().default(0),
})

export type AnnualPlan = typeof annualPlan.$inferSelect
export type SalesTarget = typeof salesTarget.$inferSelect
export type CashBalance = typeof cashBalance.$inferSelect
