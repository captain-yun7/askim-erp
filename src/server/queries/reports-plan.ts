import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { annualPlan, cashBalance, deal, dealCategory, salesTarget } from '@/lib/db/schema'
import { PLAN_GROUPS, type PlanGroupCode, type Priority } from '@/lib/plan-groups'

/**
 * 매출목표 및 현금흐름 — 엑셀 '26년 plan' 시트
 *
 * [매출 달성률] VAT 제외
 *   달성치 = 귀속연도 deal.sales_amount_net 합 (deal_category.plan_group 단위)
 *   수익   = deal.profit 합 / 수익률 = 수익 ÷ 달성치 / 목표% = 목표 ÷ 총목표 / 달성% = 달성치 ÷ 목표
 * [현금흐름] VAT 포함
 *   계좌잔액은 수기 입력 · 이후 매출(예정) = 미입금 건 총매출(gross) 합 · 이후 매입(예정) = 미지급 건 총매입(gross) 합
 */

export type PlanGroupRow = {
  code: PlanGroupCode
  label: string
  priority: Priority | null
  target: number
  achieved: number
  profit: number
  /** 매핑된 상품구분명 */
  categories: string[]
}

export type CashRow = {
  id: number
  label: string
  amountKrw: number
  amountFx: number | null
  fxCurrency: string | null
}

export type PlanReport = {
  year: number
  groups: PlanGroupRow[]
  totals: { target: number; achieved: number; profit: number }
  unmapped: { achieved: number; profit: number; categories: string[] }
  cash: {
    asOf: string | null
    fxRateUsd: number | null
    rows: CashRow[]
    balanceTotal: number
    futureSales: number
    futurePurchase: number
  }
}

const num = (v: string | null | undefined) => parseFloat(v ?? '0') || 0

export async function getPlanReport({ year }: { year: number }): Promise<PlanReport> {
  const [targets, byCategory, categories, [plan], cashRows, [future]] = await Promise.all([
    db.select().from(salesTarget).where(eq(salesTarget.year, year)),
    db
      .select({
        categoryId: deal.categoryId,
        achieved: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
        profit: sql<string>`coalesce(sum(${deal.profit}), 0)::text`,
      })
      .from(deal)
      .where(and(isNull(deal.deletedAt), eq(deal.accrualYear, year)))
      .groupBy(deal.categoryId),
    db
      .select({ id: dealCategory.id, nameKo: dealCategory.nameKo, planGroup: dealCategory.planGroup })
      .from(dealCategory)
      .orderBy(asc(dealCategory.displayOrder)),
    db.select().from(annualPlan).where(eq(annualPlan.year, year)).limit(1),
    db.select().from(cashBalance).where(eq(cashBalance.year, year)).orderBy(asc(cashBalance.displayOrder)),
    // 완료체크 안 된 건 — 연도 무관 (엑셀 SUMIFS 전체열)
    db
      .select({
        sales: sql<string>`coalesce(sum(coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet})) filter (where ${deal.salesPaidStatus} <> 'completed'), 0)::text`,
        purchase: sql<string>`coalesce(sum(coalesce(${deal.purchaseAmountGross}, ${deal.purchaseAmountNet})) filter (where ${deal.purchasePaidStatus} <> 'completed'), 0)::text`,
      })
      .from(deal)
      .where(isNull(deal.deletedAt)),
  ])

  const catById = new Map(categories.map((c) => [c.id, c]))
  const targetByGroup = new Map(targets.map((t) => [t.groupCode, t]))

  const groups: PlanGroupRow[] = PLAN_GROUPS.map((g) => ({
    code: g.code,
    label: g.label,
    priority: (targetByGroup.get(g.code)?.priority as Priority | undefined) ?? null,
    target: num(targetByGroup.get(g.code)?.targetAmount),
    achieved: 0,
    profit: 0,
    categories: categories.filter((c) => c.planGroup === g.code).map((c) => c.nameKo),
  }))
  const groupByCode = new Map(groups.map((g) => [g.code, g]))
  const unmapped = { achieved: 0, profit: 0, categories: [] as string[] }

  for (const r of byCategory) {
    const cat = r.categoryId != null ? catById.get(r.categoryId) : undefined
    const g = cat?.planGroup ? groupByCode.get(cat.planGroup as PlanGroupCode) : undefined
    if (g) {
      g.achieved += num(r.achieved)
      g.profit += num(r.profit)
    } else {
      unmapped.achieved += num(r.achieved)
      unmapped.profit += num(r.profit)
      if (cat && !unmapped.categories.includes(cat.nameKo)) unmapped.categories.push(cat.nameKo)
    }
  }

  const totals = groups.reduce(
    (acc, g) => {
      acc.target += g.target
      acc.achieved += g.achieved
      acc.profit += g.profit
      return acc
    },
    { target: 0, achieved: 0, profit: 0 },
  )

  const rows: CashRow[] = cashRows.map((r) => ({
    id: r.id,
    label: r.label,
    amountKrw: num(r.amountKrw),
    amountFx: r.amountFx != null ? num(r.amountFx) : null,
    fxCurrency: r.fxCurrency,
  }))

  return {
    year,
    groups,
    totals,
    unmapped,
    cash: {
      asOf: plan?.cashAsOf ?? null,
      fxRateUsd: plan?.fxRateUsd != null ? num(plan.fxRateUsd) : null,
      rows,
      balanceTotal: rows.reduce((a, r) => a + r.amountKrw, 0),
      futureSales: num(future?.sales),
      futurePurchase: num(future?.purchase),
    },
  }
}
