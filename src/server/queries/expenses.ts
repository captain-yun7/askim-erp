import { and, eq, isNull, or } from 'drizzle-orm'
import { getCurrentEntity } from '@/server/entity'
import { expense } from '@/lib/db/schema'
import { paymentMethodEnum } from '@/lib/db/schema/enums'
import { compactText, looseLike } from '@/server/text-search'

export type ExpenseListFilters = { q?: string; year?: number; month?: number; categoryId?: number; method?: string }

type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number]
const isPaymentMethod = (v: unknown): v is PaymentMethod => paymentMethodEnum.enumValues.includes(v as PaymentMethod)

/** 판관비 목록 조건 — 화면과 엑셀 내보내기가 같은 조건을 쓴다 (2026-10-21) */
export async function expenseListWhere(f: ExpenseListFilters) {
  const conds = [eq(expense.entity, await getCurrentEntity()), isNull(expense.deletedAt)]
  if (f.year) conds.push(eq(expense.year, f.year))
  if (f.month) conds.push(eq(expense.month, f.month))
  if (f.categoryId) conds.push(eq(expense.expenseCategoryId, f.categoryId))
  if (isPaymentMethod(f.method)) conds.push(eq(expense.paymentMethod, f.method))
  // 띄어쓰기 무시 검색 (2026-10-21 요청)
  if (f.q && compactText(f.q)) conds.push(or(looseLike(expense.itemName, f.q), looseLike(expense.counterpartyText, f.q))!)
  return and(...conds)
}
