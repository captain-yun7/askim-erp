import { asc, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { employee } from '@/lib/db/schema'

/** 인사관리 목록 — 호출하는 쪽에서 canAccessHr 를 먼저 확인한다 */
export async function listEmployees() {
  return db
    .select()
    .from(employee)
    .where(isNull(employee.deletedAt))
    // 엑셀과 같은 순서: 입사일 순, 같은 날은 입력 순
    .orderBy(asc(employee.displayOrder), sql`${employee.hireDate} asc nulls last`, asc(employee.id))
}
