import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal } from '@/lib/db/schema'

export type LedgerBasis = 'accrual' | 'cash'

export type LedgerRow = {
  month: number
  sales: number
  purchase: number
  profit: number
}

export type SalesLedger = {
  year: number
  basis: LedgerBasis
  rows: LedgerRow[]
  total: { sales: number; purchase: number; profit: number }
}

function emptyMonths(): Map<number, { sales: number; purchase: number }> {
  const m = new Map<number, { sales: number; purchase: number }>()
  for (let i = 1; i <= 12; i++) m.set(i, { sales: 0, purchase: 0 })
  return m
}

export async function getSalesLedger({
  year,
  basis,
}: {
  year: number
  basis: LedgerBasis
}): Promise<SalesLedger> {
  const months = emptyMonths()

  if (basis === 'accrual') {
    // 발생주의: 귀속연/월 기준 그룹
    const rows = await db
      .select({
        month: deal.accrualMonth,
        sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
        purchase: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(and(isNull(deal.deletedAt), eq(deal.accrualYear, year)))
      .groupBy(deal.accrualMonth)

    for (const r of rows) {
      const slot = months.get(r.month)
      if (!slot) continue
      slot.sales = parseFloat(r.sales)
      slot.purchase = parseFloat(r.purchase)
    }
  } else {
    // 현금주의: 매출=입금일(salesPaidDate), 매입=지급일(purchasePaidDate)
    const salesRows = await db
      .select({
        month: sql<number>`extract(month from ${deal.salesPaidDate})::int`,
        sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(
        and(
          isNull(deal.deletedAt),
          sql`${deal.salesPaidDate} is not null`,
          sql`extract(year from ${deal.salesPaidDate})::int = ${year}`,
        ),
      )
      .groupBy(sql`extract(month from ${deal.salesPaidDate})`)

    const purchaseRows = await db
      .select({
        month: sql<number>`extract(month from ${deal.purchasePaidDate})::int`,
        purchase: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(
        and(
          isNull(deal.deletedAt),
          sql`${deal.purchasePaidDate} is not null`,
          sql`extract(year from ${deal.purchasePaidDate})::int = ${year}`,
        ),
      )
      .groupBy(sql`extract(month from ${deal.purchasePaidDate})`)

    for (const r of salesRows) {
      const slot = months.get(r.month)
      if (slot) slot.sales = parseFloat(r.sales)
    }
    for (const r of purchaseRows) {
      const slot = months.get(r.month)
      if (slot) slot.purchase = parseFloat(r.purchase)
    }
  }

  const rows: LedgerRow[] = []
  const total = { sales: 0, purchase: 0, profit: 0 }
  for (let m = 1; m <= 12; m++) {
    const { sales, purchase } = months.get(m)!
    const profit = sales - purchase
    rows.push({ month: m, sales, purchase, profit })
    total.sales += sales
    total.purchase += purchase
    total.profit += profit
  }

  return { year, basis, rows, total }
}
