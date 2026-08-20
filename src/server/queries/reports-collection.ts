import { and, eq, isNull, sql, type SQLWrapper } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { annualPlan, deal } from '@/lib/db/schema'

/**
 * 월별 수금·결산 — 엑셀 '월별 수금,결산' 시트
 *
 * 예정       = 매출: 입금예정일 월 / 매입: 결산연월(없으면 결산예정일 월) 기준 합계
 * 수금/결산  = 입금일(지급일) 월 기준 합계 (통장 기준)
 * 미수/미결산 = 예정월에 속하면서 아직 입금(지급)되지 않은 금액
 * 달성율     = 수금 / 월 목표매출(연 목표 ÷ 12), 소계는 총수금 / 연 목표
 */

export type CollectionMonth = {
  month: number
  salesPlanned: number
  salesCollected: number
  salesOutstanding: number
  purchasePlanned: number
  purchaseSettled: number
  purchaseOutstanding: number
}

export type CollectionReport = {
  year: number
  annualSalesTarget: number | null
  months: CollectionMonth[]
  total: Omit<CollectionMonth, 'month'>
}

const num = (v: string | null | undefined) => parseFloat(v ?? '0') || 0

function byMonth(col: SQLWrapper, year: number) {
  return and(
    isNull(deal.deletedAt),
    sql`extract(year from ${col})::int = ${year}`,
  )
}

export async function getMonthlyCollection({ year }: { year: number }): Promise<CollectionReport> {
  const monthOf = (col: SQLWrapper) => sql<number>`extract(month from ${col})::int`
  // 매입 예정: 결산연월 우선, 없으면 결산예정일
  const settleYear = sql`coalesce(${deal.settlementYear}, extract(year from ${deal.purchaseDueDate})::int)`
  const settleMonth = sql<number>`coalesce(${deal.settlementMonth}, extract(month from ${deal.purchaseDueDate})::int)`

  const [salesPlanned, salesCollected, purchasePlanned, purchaseSettled, [plan]] = await Promise.all([
    db
      .select({
        month: monthOf(deal.salesDueDate),
        planned: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
        outstanding: sql<string>`coalesce(sum(${deal.salesAmountNet}) filter (where ${deal.salesPaidStatus} <> 'completed'), 0)::text`,
      })
      .from(deal)
      .where(byMonth(deal.salesDueDate, year))
      .groupBy(monthOf(deal.salesDueDate)),
    db
      .select({
        month: monthOf(deal.salesPaidDate),
        amount: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(byMonth(deal.salesPaidDate, year))
      .groupBy(monthOf(deal.salesPaidDate)),
    db
      .select({
        month: settleMonth,
        planned: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
        outstanding: sql<string>`coalesce(sum(${deal.purchaseAmountNet}) filter (where ${deal.purchasePaidStatus} <> 'completed'), 0)::text`,
      })
      .from(deal)
      .where(and(isNull(deal.deletedAt), sql`${settleYear} = ${year}`))
      .groupBy(settleMonth),
    db
      .select({
        month: monthOf(deal.purchasePaidDate),
        amount: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(byMonth(deal.purchasePaidDate, year))
      .groupBy(monthOf(deal.purchasePaidDate)),
    db.select().from(annualPlan).where(eq(annualPlan.year, year)).limit(1),
  ])

  const months: CollectionMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    salesPlanned: 0,
    salesCollected: 0,
    salesOutstanding: 0,
    purchasePlanned: 0,
    purchaseSettled: 0,
    purchaseOutstanding: 0,
  }))
  const at = (m: number) => (m >= 1 && m <= 12 ? months[m - 1] : null)

  for (const r of salesPlanned) {
    const s = at(r.month)
    if (s) {
      s.salesPlanned = num(r.planned)
      s.salesOutstanding = num(r.outstanding)
    }
  }
  for (const r of salesCollected) {
    const s = at(r.month)
    if (s) s.salesCollected = num(r.amount)
  }
  for (const r of purchasePlanned) {
    const s = at(r.month)
    if (s) {
      s.purchasePlanned = num(r.planned)
      s.purchaseOutstanding = num(r.outstanding)
    }
  }
  for (const r of purchaseSettled) {
    const s = at(r.month)
    if (s) s.purchaseSettled = num(r.amount)
  }

  const total = months.reduce(
    (acc, m) => {
      acc.salesPlanned += m.salesPlanned
      acc.salesCollected += m.salesCollected
      acc.salesOutstanding += m.salesOutstanding
      acc.purchasePlanned += m.purchasePlanned
      acc.purchaseSettled += m.purchaseSettled
      acc.purchaseOutstanding += m.purchaseOutstanding
      return acc
    },
    {
      salesPlanned: 0,
      salesCollected: 0,
      salesOutstanding: 0,
      purchasePlanned: 0,
      purchaseSettled: 0,
      purchaseOutstanding: 0,
    },
  )

  return {
    year,
    annualSalesTarget: plan?.annualSalesTarget != null ? num(plan.annualSalesTarget) : null,
    months,
    total,
  }
}
