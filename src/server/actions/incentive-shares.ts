'use server'

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { deal, dealIncentiveShare, users } from '@/lib/db/schema'
import { canViewCommission, getSessionUser } from '@/server/auth/guards'
import { canEditDealScoped } from '@/server/auth/deal-scope'
import { getCurrentEntity } from '@/server/entity'
import { audit } from '@/server/audit'
import type { IncentiveShare } from '@/lib/incentive'

const sharesSchema = z
  .array(z.object({ userId: z.string().uuid(), percent: z.number().min(0).max(100) }))
  .max(10, '추가 대상자는 10명까지입니다')
  .refine((a) => new Set(a.map((s) => s.userId)).size === a.length, '같은 사람이 두 번 들어 있습니다')

const pct = (rate: string) => `${Math.round(parseFloat(rate) * 10000) / 100}%`

/**
 * 추가 성과급 대상자 저장 (2026-10-14) — 목록 성과급 칸에서 사람·요율을 통째로 바꾼다.
 * 권한은 인센티브 요율과 같다: 성과급을 볼 수 있고 거래를 수정할 수 있는 사람
 */
export async function setIncentiveShares(dealId: string, raw: unknown): Promise<{ ok: true; shares: IncentiveShare[] } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const parsed = sharesSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  if (!z.string().uuid().safeParse(dealId).success) return { error: '잘못된 요청입니다' }

  const [existing] = await db
    .select()
    .from(deal)
    .where(and(eq(deal.id, dealId), eq(deal.entity, await getCurrentEntity()), isNull(deal.deletedAt)))
    .limit(1)
  if (!existing) return { error: '거래를 찾을 수 없습니다' }
  const ref = { status: existing.status as 'draft' | 'confirmed' | 'closed', ownerUserId: existing.ownerUserId }
  if (!canViewCommission(user, ref) || !(await canEditDealScoped(user, existing))) return { error: '이 거래의 성과급을 수정할 권한이 없습니다' }
  const next = parsed.data.filter((s) => s.userId !== existing.ownerUserId)
  if (next.length !== parsed.data.length) return { error: '담당자는 인센티브(%) 칸에서 고칩니다' }
  if (next.length) {
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, next.map((s) => s.userId)))
    if (found.length !== next.length) return { error: '없는 사용자가 있습니다' }
  }

  const before = await currentShares(dealId)
  await db.transaction(async (tx) => {
    await tx.delete(dealIncentiveShare).where(eq(dealIncentiveShare.dealId, dealId))
    if (next.length)
      await tx.insert(dealIncentiveShare).values(
        next.map((s, i) => ({ dealId, userId: s.userId, rate: (Math.round(s.percent * 100) / 10000).toFixed(4), sortOrder: i, createdBy: user.id })),
      )
  })
  const after = await currentShares(dealId)
  const text = (a: IncentiveShare[]) => a.map((s) => `${s.name} ${pct(s.rate)}`).join(', ') || '없음'
  await audit({
    action: 'deal.incentive_share',
    targetType: 'deal',
    targetId: dealId,
    targetLabel: existing.dealCode,
    summary: `${existing.dealCode} 추가 성과급 ${text(before)} → ${text(after)}`,
    detail: { before, after },
  })
  return { ok: true, shares: after }
}

async function currentShares(dealId: string): Promise<IncentiveShare[]> {
  const rows = await db
    .select({ userId: dealIncentiveShare.userId, name: users.name, rate: dealIncentiveShare.rate })
    .from(dealIncentiveShare)
    .innerJoin(users, eq(users.id, dealIncentiveShare.userId))
    .where(eq(dealIncentiveShare.dealId, dealId))
    .orderBy(asc(dealIncentiveShare.sortOrder), asc(dealIncentiveShare.id))
  return rows
}
