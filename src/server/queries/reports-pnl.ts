import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal, expense } from '@/lib/db/schema'

export type MonthlyPnlRow = {
  month: number
  grossProfit: number
  expense: number
  operatingProfit: number
  tithe: number
}

export type MonthlyPnl = {
  year: number
  rows: MonthlyPnlRow[]
  total: MonthlyPnlRow
}

function num(v: string | null) {
  return parseFloat(v ?? '0') || 0
}

function tithe(operatingProfit: number) {
  return Math.max(operatingProfit, 0) * 0.1
}

export async function getMonthlyPnl({ year }: { year: number }): Promise<MonthlyPnl> {
  const [dealRows, expenseRows] = await Promise.all([
    // 매출총이익 = SUM(salesAmountNet) - SUM(purchaseAmountNet), 귀속월 기준
    db
      .select({
        month: deal.accrualMonth,
        grossProfit: sql<string>`coalesce(sum(coalesce(${deal.salesAmountNet}, 0) - coalesce(${deal.purchaseAmountNet}, 0)), 0)::text`,
      })
      .from(deal)
      .where(and(isNull(deal.deletedAt), eq(deal.accrualYear, year)))
      .groupBy(deal.accrualMonth),
    // 판관비 = SUM(amount), expense.year/month 기준
    db
      .select({
        month: expense.month,
        expense: sql<string>`coalesce(sum(${expense.amount}), 0)::text`,
      })
      .from(expense)
      .where(and(isNull(expense.deletedAt), eq(expense.year, year)))
      .groupBy(expense.month),
  ])

  const grossByMonth = new Map<number, number>()
  for (const r of dealRows) grossByMonth.set(r.month, num(r.grossProfit))

  const expenseByMonth = new Map<number, number>()
  for (const r of expenseRows) {
    if (r.month != null) expenseByMonth.set(r.month, num(r.expense))
  }

  const rows: MonthlyPnlRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const grossProfit = grossByMonth.get(month) ?? 0
    const exp = expenseByMonth.get(month) ?? 0
    const operatingProfit = grossProfit - exp
    return {
      month,
      grossProfit,
      expense: exp,
      operatingProfit,
      tithe: tithe(operatingProfit),
    }
  })

  const total = rows.reduce<MonthlyPnlRow>(
    (acc, r) => {
      acc.grossProfit += r.grossProfit
      acc.expense += r.expense
      acc.operatingProfit += r.operatingProfit
      acc.tithe += r.tithe
      return acc
    },
    { month: 0, grossProfit: 0, expense: 0, operatingProfit: 0, tithe: 0 },
  )

  return { year, rows, total }
}
