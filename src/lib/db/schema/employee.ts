import { date, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// 인사관리 (2026-10-02 요청) — 엑셀 '인사관리(2026)' 시트. 급여 정보라 관리자(admin)만 조회·수정한다.
export const employee = pgTable('employee', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  position: text('position'),
  // 주민번호 앞자리 — 엑셀에 "860218 (음력)" 처럼 적힌 값도 있어 문자열로 둔다
  birthCode: text('birth_code'),
  department: text('department'),
  hireDate: date('hire_date'),
  annualSalary: numeric('annual_salary', { precision: 15, scale: 0 }),
  monthlySalary: numeric('monthly_salary', { precision: 15, scale: 0 }),
  incentive: text('incentive'),
  leaveDate: date('leave_date'),
  pensionYear: integer('pension_year'),
  memo: text('memo'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type Employee = typeof employee.$inferSelect
