'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { expense } from '@/lib/db/schema'
import { canCreateExpense, getSessionUser } from '@/server/auth/guards'

const numStrSchema = z
  .union([z.string(), z.number(), z.null(), z.literal('')])
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
    return isNaN(n) ? null : n.toString()
  })

const dateSchema = z
  .union([z.string(), z.null(), z.literal('')])
  .transform((v) => (v && v !== '' ? v : null))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable())

const rowSchema = z.object({
  expenseDate: dateSchema,
  itemName: z.string().trim().optional().nullable(),
  counterpartyText: z.string().trim().optional().nullable(),
  amount: numStrSchema,
  expenseCategoryId: z.coerce.number().int().nullable().optional(),
})

const createExpensesSchema = z.object({
  paymentMethod: z
    .enum(['corporate_card', 'personal_card', 'cash', 'bank_transfer'])
    .default('corporate_card'),
  payerUserId: z.string().uuid().nullable().optional(),
  rows: z.array(rowSchema),
})

export type ExpenseRowInput = z.input<typeof rowSchema>
export type CreateExpensesInput = z.input<typeof createExpensesSchema>

export async function createExpenses(raw: unknown) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canCreateExpense(user.role)) return { error: '판관비 등록 권한이 없습니다' }

  const parsed = createExpensesSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }
  const data = parsed.data

  // 영업은 본인 지출만 입력 (지출자 강제)
  const payerUserId =
    user.role === 'sales' ? user.id : (data.payerUserId ?? null)

  // 금액 없는 빈 행은 무시
  const rows = data.rows.filter((r) => r.amount !== null)
  if (rows.length === 0) return { error: '저장할 행이 없습니다' }

  for (const r of rows) {
    if (!r.expenseDate) return { error: '지출일을 입력하세요' }
  }

  try {
    await db.insert(expense).values(
      rows.map((r) => ({
        expenseDate: r.expenseDate as string,
        itemName: r.itemName ?? null,
        counterpartyText: r.counterpartyText ?? null,
        amount: r.amount as string,
        expenseCategoryId: r.expenseCategoryId ?? null,
        paymentMethod: data.paymentMethod,
        payerUserId,
        createdBy: user.id,
      })),
    )
    revalidatePath('/expenses')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '저장 실패' }
  }
}
