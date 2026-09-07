'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { expense } from '@/lib/db/schema'
import { canCreateExpense, canDeleteExpense, canEditExpense, getSessionUser } from '@/server/auth/guards'

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

const updateExpenseSchema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '지출일 형식은 YYYY-MM-DD'),
  itemName: z.string().trim().optional().nullable(),
  counterpartyText: z.string().trim().optional().nullable(),
  amount: numStrSchema,
  expenseCategoryId: z.coerce.number().int().nullable().optional(),
  paymentMethod: z.enum(['corporate_card', 'personal_card', 'cash', 'bank_transfer']),
})
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>

/** 판관비·리포트가 같은 데이터를 보므로 함께 갱신 */
function revalidateExpenseViews() {
  revalidatePath('/expenses')
  revalidatePath('/reports/ledger')
  revalidatePath('/reports/pnl')
  revalidatePath('/')
}

async function loadExpenseForGuard(id: string) {
  const [row] = await db
    .select({ createdBy: expense.createdBy, payerUserId: expense.payerUserId, createdAt: expense.createdAt })
    .from(expense)
    .where(eq(expense.id, id))
    .limit(1)
  return row ?? null
}

export async function updateExpense(id: string, raw: unknown) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const existing = await loadExpenseForGuard(id)
  if (!existing) return { error: '지출을 찾을 수 없습니다' }
  if (!canEditExpense(user, existing)) return { error: '이 지출을 수정할 권한이 없습니다' }

  const parsed = updateExpenseSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const d = parsed.data
  if (d.amount === null) return { error: '금액을 입력하세요' }

  await db
    .update(expense)
    .set({
      expenseDate: d.expenseDate,
      itemName: d.itemName || null,
      counterpartyText: d.counterpartyText || null,
      amount: d.amount,
      expenseCategoryId: d.expenseCategoryId ?? null,
      paymentMethod: d.paymentMethod,
    })
    .where(eq(expense.id, id))
  revalidateExpenseViews()
  return { ok: true }
}

export async function deleteExpense(id: string) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const existing = await loadExpenseForGuard(id)
  if (!existing) return { error: '지출을 찾을 수 없습니다' }
  if (!canDeleteExpense(user, existing)) return { error: '이 지출을 삭제할 권한이 없습니다 (영업은 본인 입력건 7일 이내)' }

  await db.update(expense).set({ deletedAt: new Date() }).where(eq(expense.id, id))
  revalidateExpenseViews()
  return { ok: true }
}
