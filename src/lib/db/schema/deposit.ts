import {
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { counterparty } from './counterparty'
import { users } from './users'

// 보증금 현황 — 엑셀 '[Askim] 영업관련 보증금 관리 시트 > 보증금현황'
// status: held(보유) | returned(반환) | offset(다음 광고에서 상계) | unreturned(미반환)
export const deposit = pgTable('deposit', {
  id: serial('id').primaryKey(),
  counterpartyName: text('counterparty_name').notNull(),
  counterpartyId: uuid('counterparty_id').references(() => counterparty.id),
  description: text('description'),
  ownerName: text('owner_name'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull().default('0'),
  paidDate: date('paid_date'),
  returnedDate: date('returned_date'),
  status: text('status', { enum: ['held', 'returned', 'offset', 'unreturned'] })
    .notNull()
    .default('held'),
  memo: text('memo'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// 전속매체 계약사항 — 같은 파일 '전속매체 계약사항' 시트
export const exclusiveContract = pgTable('exclusive_contract', {
  id: serial('id').primaryKey(),
  mediaName: text('media_name').notNull(),
  mediaType: text('media_type'),
  ownerName: text('owner_name'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  contractPeriod: text('contract_period'),
  contractTerms: text('contract_terms'),
  hasMonthlyFee: text('has_monthly_fee', { enum: ['O', 'X'] }),
  depositPaidDate: date('deposit_paid_date'),
  depositReturnedDate: date('deposit_returned_date'),
  memo: text('memo'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type Deposit = typeof deposit.$inferSelect
export type ExclusiveContract = typeof exclusiveContract.$inferSelect
