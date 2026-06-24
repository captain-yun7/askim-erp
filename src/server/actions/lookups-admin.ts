'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import {
  account,
  dealCategory,
  expenseCategory,
  salesMethod,
} from '@/lib/db/schema'
import { canManageLookups, getSessionUser } from '@/server/auth/guards'

async function requireLookupAdmin() {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' as const }
  if (!canManageLookups(user.role)) return { error: '권한이 없습니다' as const }
  return { user }
}

function done() {
  revalidatePath('/admin/lookups')
  return { ok: true as const }
}

// commission_rate: numeric(5,4) — 문자열 또는 빈값 허용
const rateSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine(
    (v) => !v || /^\d*\.?\d+$/.test(v),
    '요율은 숫자(예: 0.05)로 입력하세요',
  )

const dealCategorySchema = z.object({
  nameKo: z.string().trim().min(1, '명칭 필수'),
  commissionRate: rateSchema,
  displayOrder: z.coerce.number().int().default(0),
  memo: z.string().trim().optional().nullable(),
})

export async function updateDealCategory(id: number, raw: unknown) {
  const guard = await requireLookupAdmin()
  if ('error' in guard) return { error: guard.error }
  const parsed = dealCategorySchema.safeParse(raw)
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const { nameKo, commissionRate, displayOrder, memo } = parsed.data
  await db
    .update(dealCategory)
    .set({
      nameKo,
      commissionRate: commissionRate || null,
      displayOrder,
      memo: memo || null,
    })
    .where(eq(dealCategory.id, id))
  return done()
}

const accountSchema = z.object({
  nameKo: z.string().trim().min(1, '명칭 필수'),
  displayOrder: z.coerce.number().int().default(0),
})

export async function updateAccount(id: number, raw: unknown) {
  const guard = await requireLookupAdmin()
  if ('error' in guard) return { error: guard.error }
  const parsed = accountSchema.safeParse(raw)
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  await db
    .update(account)
    .set({ nameKo: parsed.data.nameKo, displayOrder: parsed.data.displayOrder })
    .where(eq(account.id, id))
  return done()
}

const salesMethodSchema = z.object({
  nameKo: z.string().trim().min(1, '명칭 필수'),
  displayOrder: z.coerce.number().int().default(0),
})

export async function updateSalesMethod(id: number, raw: unknown) {
  const guard = await requireLookupAdmin()
  if ('error' in guard) return { error: guard.error }
  const parsed = salesMethodSchema.safeParse(raw)
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  await db
    .update(salesMethod)
    .set({ nameKo: parsed.data.nameKo, displayOrder: parsed.data.displayOrder })
    .where(eq(salesMethod.id, id))
  return done()
}

const expenseCategorySchema = z.object({
  nameKo: z.string().trim().min(1, '명칭 필수'),
  isFixedCost: z.boolean().default(false),
  displayOrder: z.coerce.number().int().default(0),
})

export async function updateExpenseCategory(id: number, raw: unknown) {
  const guard = await requireLookupAdmin()
  if ('error' in guard) return { error: guard.error }
  const parsed = expenseCategorySchema.safeParse(raw)
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  await db
    .update(expenseCategory)
    .set({
      nameKo: parsed.data.nameKo,
      isFixedCost: parsed.data.isFixedCost,
      displayOrder: parsed.data.displayOrder,
    })
    .where(eq(expenseCategory.id, id))
  return done()
}
