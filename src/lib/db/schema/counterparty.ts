import { sql } from 'drizzle-orm'
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './users'

export const counterparty = pgTable(
  'counterparty',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    businessNo: text('business_no'),
    ceo: text('ceo'),
    address: text('address'),
    businessType: text('business_type'),
    businessCategory: text('business_category'),
    phone: text('phone'),
    email: text('email'),
    contactPerson: text('contact_person'),
    bankAccountRaw: text('bank_account_raw'), // 엑셀 원문(legacy) — 은행/계좌 분리 전 값 보존
    bankName: text('bank_name'),
    accountNo: text('account_no'),
    accountHolder: text('account_holder'),
    officialFeeRate: text('official_fee_rate'),
    unofficialFeeRate: text('unofficial_fee_rate'),
    paymentTerm: text('payment_term'),
    roleTags: text('role_tags').array().notNull().default(sql`'{}'::text[]`),
    memo: text('memo'),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('counterparty_business_no_uq')
      .on(t.businessNo)
      .where(sql`${t.businessNo} IS NOT NULL`),
  ],
)

export type Counterparty = typeof counterparty.$inferSelect
export type NewCounterparty = typeof counterparty.$inferInsert
