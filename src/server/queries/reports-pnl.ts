import { buildLedgerLines, getSalesLedger } from '@/server/queries/reports-ledger'

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

function tithe(operatingProfit: number) {
  return Math.max(operatingProfit, 0) * 0.1
}

/**
 * 월별 손익 (2026-10-14 요청: 매출총이익을 매출장표 손익(통장)으로 — 귀속월이 아닌 통장 입금 기준).
 * 매출장표와 숫자가 꼭 같아야 해서 매출장표 계산(getSalesLedger·buildLedgerLines)을 그대로 쓴다.
 */
export async function getMonthlyPnl({ year }: { year: number }): Promise<MonthlyPnl> {
  const lines = buildLedgerLines(await getSalesLedger({ year }))
  const line = (key: string) => lines.find((l) => l.key === key)?.values ?? Array<number>(12).fill(0)
  const grossByMonth = line('gross_cash')
  const expenseByMonth = line('sgna')

  const rows: MonthlyPnlRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const grossProfit = grossByMonth[i]
    const exp = expenseByMonth[i]
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
