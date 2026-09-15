import { index, jsonb, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// 감사 로그 — 모든 사용자 행위(로그인·생성·수정·삭제·내보내기·첨부 열람)의 일시·주체·대상 (2026-09-15 요구)
export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** 사용자 삭제와 무관하게 남기기 위해 FK 없이 스냅샷 */
    userId: uuid('user_id'),
    userName: text('user_name'),
    userRole: text('user_role'),
    /** 예: deal.create, auth.login, export.xlsx */
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    targetLabel: text('target_label'),
    summary: text('summary').notNull(),
    /** 변경 전/후 값 등 */
    detail: jsonb('detail'),
    ip: text('ip'),
  },
  (t) => [index('audit_log_at_idx').on(t.at), index('audit_log_user_idx').on(t.userId, t.at), index('audit_log_action_idx').on(t.action, t.at)],
)

export type AuditLog = typeof auditLog.$inferSelect
