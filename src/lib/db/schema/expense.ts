import { sql } from 'drizzle-orm'
import {
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
import { paymentMethodEnum } from './enums'
import { expenseCategory } from './lookups'
import { users } from './users'

export const expense = pgTable(
  'expense',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expenseDate: date('expense_date').notNull(),
    year: integer('year').generatedAlwaysAs(
      sql`extract(year from expense_date)::int`,
    ),
    month: integer('month').generatedAlwaysAs(
      sql`extract(month from expense_date)::int`,
    ),
    itemName: text('item_name'),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    vat: numeric('vat', { precision: 15, scale: 2 }),

    // 거래처 — 마스터 매칭되면 FK, 아니면 자유텍스트
    counterpartyId: uuid('counterparty_id').references(() => counterparty.id),
    counterpartyText: text('counterparty_text'),

    expenseCategoryId: integer('expense_category_id').references(
      () => expenseCategory.id,
    ),
    paymentMethod: paymentMethodEnum('payment_method')
      .notNull()
      .default('corporate_card'),
    payerUserId: uuid('payer_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    memo: text('memo'),
    receiptUrl: text('receipt_url'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('expense_year_month_idx').on(t.year, t.month, t.expenseCategoryId),
    index('expense_date_idx').on(t.expenseDate),
  ],
)

export type Expense = typeof expense.$inferSelect
export type NewExpense = typeof expense.$inferInsert
