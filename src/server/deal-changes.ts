import { and, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { dealFieldChange, users } from '@/lib/db/schema'
import { CHANGE_HIGHLIGHT_DAYS, type RecentChanges } from '@/lib/change-highlight'

/** 변경 전/후를 비교해 바뀐 필드만 이력으로 남긴다 (numeric 은 원 단위 반올림 비교) */
export async function recordDealChanges(
  dealId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  userId: string,
) {
  const norm = (v: unknown) => {
    if (v == null || v === '') return null
    if (typeof v === 'number') return String(Math.round(v))
    const s = String(v)
    return /^-?\d+(\.\d+)?$/.test(s) ? String(Math.round(Number(s))) : s
  }
  const rows = Object.keys(after)
    .filter((k) => k in before && after[k] !== undefined)
    .filter((k) => norm(before[k]) !== norm(after[k]))
    .map((k) => ({ dealId, field: k, oldValue: norm(before[k]), newValue: norm(after[k]), changedBy: userId }))
  if (rows.length) await db.insert(dealFieldChange).values(rows)
}

/** 거래별 최근 N일 변경 (field → 최신 1건) */
export async function getRecentChanges(dealIds: string[]): Promise<Record<string, RecentChanges>> {
  if (dealIds.length === 0) return {}
  const since = new Date(Date.now() - CHANGE_HIGHLIGHT_DAYS * 86_400_000)
  const rows = await db
    .select({
      dealId: dealFieldChange.dealId,
      field: dealFieldChange.field,
      changedAt: sql<string>`max(${dealFieldChange.changedAt})::text`,
      changedBy: sql<string | null>`(array_agg(${users.name} order by ${dealFieldChange.changedAt} desc))[1]`,
    })
    .from(dealFieldChange)
    .leftJoin(users, sql`${users.id} = ${dealFieldChange.changedBy}`)
    .where(and(inArray(dealFieldChange.dealId, dealIds), gte(dealFieldChange.changedAt, since)))
    .groupBy(dealFieldChange.dealId, dealFieldChange.field)
  const out: Record<string, RecentChanges> = {}
  for (const r of rows) (out[r.dealId] ??= {})[r.field] = { changedAt: r.changedAt, changedBy: r.changedBy }
  return out
}
