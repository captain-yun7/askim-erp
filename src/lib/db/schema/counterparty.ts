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
    // 법인 (2026-10-08 요청: 한국/미국/중국 분리) — 'kr' | 'us' | 'cn'
    entity: text('entity').notNull().default('kr'),
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
    // 거래처 구분 — 매출분석보고서의 산업군 분석 기준 (2026-09-28). 값은 lib/client-type 참고, 비어 있으면 미지정
    clientType: text('client_type'),
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
    // 삭제된 거래처는 번호를 잡고 있지 않는다 (2026-10-28: 중복 정리 후 삭제했는데 등록이 막힘)
    uniqueIndex('counterparty_business_no_uq')
      .on(t.entity, t.businessNo)
      .where(sql`${t.businessNo} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  ],
)

export type Counterparty = typeof counterparty.$inferSelect
export type NewCounterparty = typeof counterparty.$inferInsert
