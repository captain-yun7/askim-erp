import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { expense, expenseCategory } from '@/lib/db/schema'

/** 기부금 월별 사용내역 (2026-09-09 피드백) — 판관비 중 거래항목 '기부금' */
export type DonationRow = {
  id: string
  expenseDate: string
  itemName: string | null
  counterpartyText: string | null
  amount: number
  paymentMethod: string
}

export type DonationMonth = { month: number; rows: DonationRow[]; total: number }

export async function getDonations({ year }: { year: number }): Promise<{ months: DonationMonth[]; total: number; count: number }> {
  const rows = await db
    .select({
      id: expense.id,
      expenseDate: expense.expenseDate,
      itemName: expense.itemName,
      counterpartyText: expense.counterpartyText,
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      month: expense.month,
    })
    .from(expense)
    .innerJoin(expenseCategory, eq(expenseCategory.id, expense.expenseCategoryId))
    .where(and(isNull(expense.deletedAt), eq(expense.year, year), eq(expenseCategory.code, 'donation')))
    .orderBy(asc(expense.expenseDate), asc(expense.createdAt))

  const months: DonationMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rows: [], total: 0 }))
  for (const r of rows) {
    const m = months[(r.month ?? 1) - 1]
    const amount = parseFloat(r.amount) || 0
    m.rows.push({ id: r.id, expenseDate: r.expenseDate, itemName: r.itemName, counterpartyText: r.counterpartyText, amount, paymentMethod: r.paymentMethod })
    m.total += amount
  }
  return { months, total: months.reduce((a, m) => a + m.total, 0), count: rows.length }
}
