'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { ledgerOverride } from '@/lib/db/schema'
import { canEditPlan, getSessionUser } from '@/server/auth/guards'

const schema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  field: z.enum(['sales_accrual', 'cogs_accrual']),
  /** null = 수기값 삭제(자동 집계로 복원) */
  amount: z.coerce.number().finite().nullable(),
})

export async function saveLedgerOverride(raw: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canEditPlan(user.role)) return { error: '회계/admin 만 수정할 수 있습니다' }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const { year, month, field, amount } = parsed.data

  const where = and(
    eq(ledgerOverride.year, year),
    eq(ledgerOverride.month, month),
    eq(ledgerOverride.field, field),
  )
  if (amount === null) {
    await db.delete(ledgerOverride).where(where)
  } else {
    await db
      .insert(ledgerOverride)
      .values({ year, month, field, amount: String(amount), updatedBy: user.id })
      .onConflictDoUpdate({
        target: [ledgerOverride.year, ledgerOverride.month, ledgerOverride.field],
        set: { amount: String(amount), updatedBy: user.id },
      })
  }
  revalidatePath('/reports/ledger')
  return { ok: true }
}
