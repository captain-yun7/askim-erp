import { sql } from 'drizzle-orm'
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { userRoleEnum } from './enums'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('sales'),
    dealCodePrefix: text('deal_code_prefix'),
    team: text('team'),
    isActive: boolean('is_active').notNull().default(true),
    // 사용자별 화면 배율 선호 (sm/md/lg/xl) — src/lib/ui-scale.ts
    uiScale: text('ui_scale').notNull().default('md'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('users_deal_code_prefix_uq')
      .on(t.dealCodePrefix)
      .where(sql`${t.dealCodePrefix} IS NOT NULL`),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
