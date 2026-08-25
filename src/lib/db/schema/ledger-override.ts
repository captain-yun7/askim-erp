import { integer, numeric, pgTable, serial, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

// 매출장표 수기 입력 — 총매출(귀속월)·매출원가_귀속월을 자동 집계 대신 수기로 덮어씀 (2026-08-25 회의)
export const ledgerOverride = pgTable(
  'ledger_override',
  {
    id: serial('id').primaryKey(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    field: text('field', { enum: ['sales_accrual', 'cogs_accrual'] }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('ledger_override_uq').on(t.year, t.month, t.field)],
)

export type LedgerOverride = typeof ledgerOverride.$inferSelect
