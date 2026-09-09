import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

// 관리자 설정 (키·값) — 첫 항목: 최근 수정 칸 음영 기간 (2026-09-09)
export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})
