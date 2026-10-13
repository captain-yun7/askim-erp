'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { reviewCountAdjust } from '@/lib/db/schema'
import { getSessionUser, isAdmin } from '@/server/auth/guards'
import { getCurrentEntity } from '@/server/entity'
import { autoReviewCounts } from '@/server/queries/review-requests'
import { audit } from '@/server/audit'

const schema = z.object({
  userId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  value: z.coerce.number().int().min(0, '0 이상으로 입력하세요').max(999),
})

/** 관리자가 월별 수정요청 횟수를 고친다 (예: 1회 차감) — 자동 집계와의 차이만 저장해 이후 요청은 계속 더해진다 */
export async function setReviewCount(raw: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser()
  if (!user || !isAdmin(user.role)) return { error: '관리자만 수정할 수 있습니다' }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '잘못된 값' }
  const { userId, year, month, value } = parsed.data
  const entity = await getCurrentEntity()
  const auto = (await autoReviewCounts(entity, year)).filter((a) => a.user_id === userId && a.month === month).reduce((s, a) => s + a.n, 0)
  const delta = value - auto
  const key = and(eq(reviewCountAdjust.entity, entity), eq(reviewCountAdjust.userId, userId), eq(reviewCountAdjust.year, year), eq(reviewCountAdjust.month, month))
  if (delta === 0) await db.delete(reviewCountAdjust).where(key)
  else
    await db
      .insert(reviewCountAdjust)
      .values({ entity, userId, year, month, delta, updatedBy: user.id })
      .onConflictDoUpdate({ target: [reviewCountAdjust.entity, reviewCountAdjust.userId, reviewCountAdjust.year, reviewCountAdjust.month], set: { delta, updatedBy: user.id, updatedAt: new Date() } })
  await audit({ action: 'review_count.set', targetType: 'user', targetId: userId, summary: `수정요청 횟수 ${year}-${String(month).padStart(2, '0')} → ${value}회 (자동 ${auto}회)`, detail: { year, month, value, auto, delta } })
  revalidatePath('/review-requests')
  return { ok: true }
}
