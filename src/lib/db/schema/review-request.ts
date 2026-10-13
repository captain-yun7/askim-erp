import { index, integer, pgTable, primaryKey, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { deal } from './deal'
import { users } from './users'

/**
 * 수정요청 기록 (2026-10-12 요청) — 관리자가 거래에 "수정요청"을 걸 때마다 한 줄.
 * 월별·담당자별 수정요청 횟수를 세는 원천. 담당자는 요청 시점의 거래 담당자로 고정한다.
 */
export const reviewRequestLog = pgTable(
  'review_request_log',
  {
    id: serial('id').primaryKey(),
    entity: text('entity').notNull().default('kr'),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deal.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('review_request_log_month_idx').on(t.entity, t.requestedAt), index('review_request_log_deal_idx').on(t.dealId)],
)

/** 관리자가 고친 월별 횟수 — 자동 집계값에 더할 차이(예: -1 = 1회 차감) */
export const reviewCountAdjust = pgTable(
  'review_count_adjust',
  {
    entity: text('entity').notNull().default('kr'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    delta: integer('delta').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.entity, t.userId, t.year, t.month] })],
)
