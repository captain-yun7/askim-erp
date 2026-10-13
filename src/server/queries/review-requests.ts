import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reviewCountAdjust, users } from '@/lib/db/schema'
import { getCurrentEntity } from '@/server/entity'

export type ReviewCountRow = {
  userId: string
  name: string
  /** 1~12월 자동 집계 */
  auto: number[]
  /** 1~12월 관리자 보정 (최종 = 자동 + 보정) */
  delta: number[]
}

/** 자동 집계 — 한국 시간 기준 요청 월, 요청 시점 담당자 */
export async function autoReviewCounts(entity: string, year: number) {
  const rows = await db.execute<{ user_id: string; month: number; n: number }>(sql`
    select owner_user_id as user_id, extract(month from requested_at at time zone 'Asia/Seoul')::int as month, count(*)::int as n
    from review_request_log
    where entity = ${entity} and owner_user_id is not null
      and requested_at >= make_timestamptz(${year}, 1, 1, 0, 0, 0, 'Asia/Seoul')
      and requested_at < make_timestamptz(${year + 1}, 1, 1, 0, 0, 0, 'Asia/Seoul')
    group by 1, 2`)
  return [...rows]
}

/** 월별·담당자별 수정요청 횟수 (2026-10-12 요청) — 활성 영업 담당자 전원 + 기록이 있는 사람 */
export async function getReviewCounts(year: number): Promise<ReviewCountRow[]> {
  const entity = await getCurrentEntity()
  const [auto, adjusts, people] = await Promise.all([
    autoReviewCounts(entity, year),
    db.select().from(reviewCountAdjust).where(and(eq(reviewCountAdjust.entity, entity), eq(reviewCountAdjust.year, year))),
    db.select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive }).from(users).orderBy(users.name),
  ])
  const map = new Map<string, ReviewCountRow>()
  const row = (id: string) => {
    let r = map.get(id)
    if (!r) {
      const p = people.find((u) => u.id === id)
      r = { userId: id, name: p?.name ?? '(삭제된 사용자)', auto: Array(12).fill(0), delta: Array(12).fill(0) }
      map.set(id, r)
    }
    return r
  }
  for (const p of people) if (p.isActive && p.role === 'sales') row(p.id)
  for (const a of auto) row(a.user_id).auto[a.month - 1] += a.n
  for (const a of adjusts) row(a.userId).delta[a.month - 1] += a.delta
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}
