'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { annualPlan, cashBalance, salesTarget } from '@/lib/db/schema'
import { PLAN_GROUP_CODES, PRIORITIES } from '@/lib/plan-groups'
import { canEditPlan, getSessionUser, type SessionUser } from '@/server/auth/guards'

type Result = { ok: true } | { error: string }

async function requirePlanEditor(): Promise<{ error: string } | { user: SessionUser }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canEditPlan(user.role)) return { error: '회계/admin 만 수정할 수 있습니다' }
  return { user }
}

const amount = z.coerce.number().finite().min(0)
const yearSchema = z.coerce.number().int().min(2020).max(2100)

// ── 연 목표매출 (월별 수금결산) ─────────────────────────
export async function saveAnnualSalesTarget(raw: unknown): Promise<Result> {
  const guard = await requirePlanEditor()
  if ('error' in guard) return { error: guard.error }
  const parsed = z.object({ year: yearSchema, annualSalesTarget: amount }).safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const { year, annualSalesTarget } = parsed.data
  await db
    .insert(annualPlan)
    .values({ year, annualSalesTarget: String(annualSalesTarget), updatedBy: guard.user.id })
    .onConflictDoUpdate({
      target: annualPlan.year,
      set: { annualSalesTarget: String(annualSalesTarget), updatedBy: guard.user.id },
    })
  revalidatePath('/reports/collection')
  return { ok: true }
}

// ── 상품군별 매출목표 ───────────────────────────────────
const targetsSchema = z.object({
  year: yearSchema,
  rows: z.array(
    z.object({
      groupCode: z.enum(PLAN_GROUP_CODES),
      priority: z.enum(PRIORITIES).nullable(),
      targetAmount: amount,
    }),
  ),
})

export async function saveSalesTargets(raw: unknown): Promise<Result> {
  const guard = await requirePlanEditor()
  if ('error' in guard) return { error: guard.error }
  const parsed = targetsSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const { year, rows } = parsed.data
  if (rows.length === 0) return { ok: true }
  await db
    .insert(salesTarget)
    .values(
      rows.map((r) => ({
        year,
        groupCode: r.groupCode,
        priority: r.priority,
        targetAmount: String(r.targetAmount),
      })),
    )
    .onConflictDoUpdate({
      target: [salesTarget.year, salesTarget.groupCode],
      set: {
        priority: sql`excluded.priority`,
        targetAmount: sql`excluded.target_amount`,
      },
    })
  revalidatePath('/reports/plan')
  return { ok: true }
}

// ── 계좌 잔액 현황 + 기준일/환율 ─────────────────────────
const cashSchema = z.object({
  year: yearSchema,
  cashAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  fxRateUsd: z.coerce.number().finite().min(0).nullable(),
  rows: z.array(
    z.object({
      id: z.number().int().nullable(),
      label: z.string().trim().min(1, '계좌명 필수'),
      amountKrw: amount,
      amountFx: z.coerce.number().finite().nullable(),
      fxCurrency: z.string().trim().max(3).nullable(),
    }),
  ),
})

export async function saveCashBalances(raw: unknown): Promise<Result> {
  const guard = await requirePlanEditor()
  if ('error' in guard) return { error: guard.error }
  const parsed = cashSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const { year, cashAsOf, fxRateUsd, rows } = parsed.data

  await db.transaction(async (tx) => {
    await tx
      .insert(annualPlan)
      .values({
        year,
        cashAsOf,
        fxRateUsd: fxRateUsd != null ? String(fxRateUsd) : null,
        updatedBy: guard.user.id,
      })
      .onConflictDoUpdate({
        target: annualPlan.year,
        set: {
          cashAsOf,
          fxRateUsd: fxRateUsd != null ? String(fxRateUsd) : null,
          updatedBy: guard.user.id,
        },
      })

    const keptIds: number[] = []
    for (const [i, r] of rows.entries()) {
      const values = {
        year,
        label: r.label,
        amountKrw: String(r.amountKrw),
        amountFx: r.amountFx != null ? String(r.amountFx) : null,
        fxCurrency: r.fxCurrency || null,
        displayOrder: i + 1,
      }
      if (r.id != null) {
        const [row] = await tx
          .update(cashBalance)
          .set(values)
          .where(and(eq(cashBalance.id, r.id), eq(cashBalance.year, year)))
          .returning({ id: cashBalance.id })
        if (row) {
          keptIds.push(row.id)
          continue
        }
      }
      const [row] = await tx.insert(cashBalance).values(values).returning({ id: cashBalance.id })
      keptIds.push(row.id)
    }
    // 화면에서 제거된 행 삭제
    const del = [eq(cashBalance.year, year)]
    if (keptIds.length) del.push(notInArray(cashBalance.id, keptIds))
    await tx.delete(cashBalance).where(and(...del))
  })

  revalidatePath('/reports/plan')
  return { ok: true }
}
