import { and, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { auditLog } from '@/lib/db/schema'

export type AuditFilters = {
  from?: string
  to?: string
  userId?: string
  action?: string
  q?: string
  page?: number
  pageSize?: number
}

export async function listAuditLogs(f: AuditFilters) {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(500, Math.max(20, f.pageSize ?? 100))
  const conds = []
  if (f.from) conds.push(gte(auditLog.at, new Date(`${f.from}T00:00:00+09:00`)))
  if (f.to) conds.push(lt(auditLog.at, new Date(new Date(`${f.to}T00:00:00+09:00`).getTime() + 86_400_000)))
  if (f.userId) conds.push(eq(auditLog.userId, f.userId))
  if (f.action) conds.push(f.action.endsWith('.') ? ilike(auditLog.action, `${f.action}%`) : eq(auditLog.action, f.action))
  if (f.q) {
    const like = `%${f.q.trim()}%`
    conds.push(or(ilike(auditLog.summary, like), ilike(auditLog.targetLabel, like), ilike(auditLog.targetId, like), ilike(auditLog.userName, like))!)
  }
  const where = conds.length ? and(...conds) : undefined
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLog).where(where).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLog).where(where),
  ])
  return { rows, total, page, pageSize }
}

/** 필터용 — 로그에 등장한 사용자 목록 */
export async function listAuditUsers() {
  return db
    .select({ userId: auditLog.userId, userName: sql<string>`max(${auditLog.userName})` })
    .from(auditLog)
    .where(sql`${auditLog.userId} is not null`)
    .groupBy(auditLog.userId)
    .orderBy(sql`max(${auditLog.userName})`)
}
