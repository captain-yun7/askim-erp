import { index, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { deal } from './deal'
import { users } from './users'

// 거래 필드 단위 변경 이력 — 목록에서 최근 수정 칸 음영 표시용 (2026-09-09 피드백)
export const dealFieldChange = pgTable(
  'deal_field_change',
  {
    id: serial('id').primaryKey(),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deal.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('deal_field_change_deal_idx').on(t.dealId, t.changedAt), index('deal_field_change_at_idx').on(t.changedAt)],
)

export type DealFieldChange = typeof dealFieldChange.$inferSelect
