'use server'

import { revalidatePath } from 'next/cache'
import { and, gte, inArray, isNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { expense, expenseCategory } from '@/lib/db/schema'
import { dupKey, parseExpenseWorkbook, type UploadIssue, type UploadRow } from '@/lib/expense-upload'
import { canCreateExpense, getSessionUser } from '@/server/auth/guards'

const MAX_BYTES = 10 * 1024 * 1024

export type PreviewRow = UploadRow & {
  categoryId: number | null
  categoryName: string | null
  duplicate: boolean
}

export type UploadPreview = {
  sheet: string
  rows: PreviewRow[]
  issues: UploadIssue[]
  summary: { total: number; amount: number; unmatched: number; duplicates: number }
}

/** 1단계: 파일 파싱 + 항목 매칭 + 기존 데이터와 중복 판정 (저장 안 함) */
export async function previewExpenseUpload(formData: FormData): Promise<{ preview: UploadPreview } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canCreateExpense(user.role)) return { error: '판관비 등록 권한이 없습니다' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { error: '파일을 선택하세요' }
  if (file.size > MAX_BYTES) return { error: '파일이 10MB 를 넘습니다' }
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { error: '엑셀(.xlsx) 파일만 올릴 수 있습니다' }

  let parsed: ReturnType<typeof parseExpenseWorkbook>
  try {
    parsed = parseExpenseWorkbook(Buffer.from(await file.arrayBuffer()))
  } catch (e) {
    return { error: e instanceof Error ? e.message : '파일을 읽을 수 없습니다' }
  }
  if (parsed.rows.length === 0) return { error: '등록할 행이 없습니다 (지출일·합계가 있는 행이 없음)' }

  const cats = await db.select({ id: expenseCategory.id, code: expenseCategory.code, nameKo: expenseCategory.nameKo }).from(expenseCategory)
  const byCode = new Map(cats.map((c) => [c.code, c]))

  // 파일 날짜 범위의 기존 지출과 비교
  const dates = parsed.rows.map((r) => r.expenseDate).sort()
  const existing = await db
    .select({ expenseDate: expense.expenseDate, amount: expense.amount, itemName: expense.itemName, counterpartyText: expense.counterpartyText })
    .from(expense)
    .where(and(isNull(expense.deletedAt), gte(expense.expenseDate, dates[0]), lte(expense.expenseDate, dates[dates.length - 1])))
  const existingKeys = new Set(existing.map(dupKey))
  const seenInFile = new Set<string>()

  const rows: PreviewRow[] = parsed.rows.map((r) => {
    const cat = byCode.get(r.categoryCode)
    const unmatched = r.categoryCode === 'other_var' && r.categoryRaw != null && !/기타/.test(r.categoryRaw)
    const key = dupKey(r)
    const duplicate = existingKeys.has(key) || seenInFile.has(key)
    seenInFile.add(key)
    return { ...r, categoryId: unmatched ? null : (cat?.id ?? null), categoryName: unmatched ? null : (cat?.nameKo ?? null), duplicate }
  })

  return {
    preview: {
      sheet: parsed.sheet,
      rows,
      issues: parsed.issues,
      summary: {
        total: rows.length,
        amount: rows.reduce((a, r) => a + r.amount, 0),
        unmatched: rows.filter((r) => r.categoryId == null).length,
        duplicates: rows.filter((r) => r.duplicate).length,
      },
    },
  }
}

const commitSchema = z.object({
  paymentMethod: z.enum(['corporate_card', 'personal_card', 'cash', 'bank_transfer']),
  skipDuplicates: z.boolean(),
  rows: z
    .array(
      z.object({
        expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        itemName: z.string().nullable(),
        amount: z.number().finite(),
        counterpartyText: z.string().nullable(),
        categoryId: z.number().int().nullable(),
        duplicate: z.boolean(),
      }),
    )
    .min(1)
    .max(10000),
})
export type CommitInput = z.input<typeof commitSchema>

/** 2단계: 미리보기 확인 후 일괄 등록 */
export async function commitExpenseUpload(raw: unknown): Promise<{ ok: true; inserted: number; skipped: number } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canCreateExpense(user.role)) return { error: '판관비 등록 권한이 없습니다' }
  const parsed = commitSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const { paymentMethod, skipDuplicates, rows } = parsed.data

  // 항목 id 는 실제 존재하는 것만
  const ids = [...new Set(rows.map((r) => r.categoryId).filter((v): v is number => v != null))]
  const valid = new Set(ids.length ? (await db.select({ id: expenseCategory.id }).from(expenseCategory).where(inArray(expenseCategory.id, ids))).map((c) => c.id) : [])

  const payerUserId = user.role === 'sales' ? user.id : null
  const target = rows.filter((r) => !(skipDuplicates && r.duplicate))
  if (target.length === 0) return { error: '등록할 행이 없습니다 (전부 중복)' }

  const CHUNK = 500
  for (let i = 0; i < target.length; i += CHUNK) {
    await db.insert(expense).values(
      target.slice(i, i + CHUNK).map((r) => ({
        expenseDate: r.expenseDate,
        itemName: r.itemName,
        amount: r.amount.toString(),
        counterpartyText: r.counterpartyText,
        expenseCategoryId: r.categoryId != null && valid.has(r.categoryId) ? r.categoryId : null,
        paymentMethod,
        payerUserId,
        createdBy: user.id,
      })),
    )
  }
  revalidatePath('/expenses')
  revalidatePath('/reports/ledger')
  revalidatePath('/reports/pnl')
  revalidatePath('/')
  return { ok: true, inserted: target.length, skipped: rows.length - target.length }
}
