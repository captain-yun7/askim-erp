import { integer, numeric, pgTable, serial, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { deal } from './deal'
import { users } from './users'

/**
 * 추가 성과급 대상자 (2026-10-14 요청) — 한 거래의 성과급을 담당자 외 사람이 나눠 받는 경우.
 * 엑셀에서는 같은 거래코드에 금액 없이 성과급만 적은 행으로 썼다. 성과급 = 손익(해외법인은 손익(KRW)) × 요율
 */
export const dealIncentiveShare = pgTable(
  'deal_incentive_share',
  {
    id: serial('id').primaryKey(),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deal.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rate: numeric('rate', { precision: 5, scale: 4 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('deal_incentive_share_deal_user_uq').on(t.dealId, t.userId)],
)
