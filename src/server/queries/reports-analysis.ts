import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { getCurrentEntity } from '@/server/entity'
import { counterparty, deal, dealCategory, users } from '@/lib/db/schema'
import { clientTypeLabel } from '@/lib/client-type'

/**
 * 매출분석보고서 (2026-09-28 요청) — 거래 데이터를 피벗처럼 묶어 보여 준다. 모두 귀속월 기준.
 *   1~5 는 선택한 연·월(월 생략 시 연간)의 VAT 포함 금액.
 *   6 은 월 선택과 무관하게 그 해 전체 누적(VAT 제외)·손익 — 고객 예시 "현 시점 기준"이 연간 전체와 일치.
 * 금액 기준은 매출장표와 같다: VAT 포함 = 총매출금/총매입금(없으면 공급가+부가세), 손익 = 매출금 − 매입금.
 */

export type ShareRow = { key: string; label: string; amount: number; ratio: number; count: number }
export type ClientRow = ShareRow & { counterpartyId: string | null; clientType: string | null; clientTypeLabel: string }
export type CumulativeRow = { owner: string; sales: number; profit: number; margin: number | null }
export type CumulativeGroup = { team: string; title: string; rows: CumulativeRow[]; total: CumulativeRow }

export type SalesAnalysis = {
  year: number
  month: number | null
  salesTotal: number
  purchaseTotal: number
  byClient: ClientRow[]
  byClientType: ShareRow[]
  byCategory: ShareRow[]
  byOwner: ShareRow[]
  bySupplier: ShareRow[]
  cumulative: { groups: CumulativeGroup[]; total: CumulativeRow }
}

/** 고객 보고서의 팀 표기 */
const TEAM_TITLE: Record<string, string> = {
  국내영업: '국내영업팀',
  중국사업부: '해외영업팀_중국사업부',
  해외영업: '해외영업팀_중국 제외',
}
const TEAM_ORDER = ['국내영업', '중국사업부', '해외영업']

const num = (v: string | null | undefined) => parseFloat(v ?? '0') || 0
// 매출장표와 같은 식 — 두 화면의 합계가 항상 같아야 한다
const salesGross = sql`coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet})`
const purchaseGross = sql`coalesce(${deal.purchaseAmountGross}, ${deal.purchaseAmountNet})`

// 금액은 소수 둘째 자리까지라 전 단위로 더해야 부동소수점 오차로 1원이 어긋나지 않는다
export const sumAmounts = (values: number[]) => values.reduce((a, v) => a + Math.round(v * 100), 0) / 100

function withRatio<T extends { amount: number }>(rows: T[]): (T & { ratio: number })[] {
  const total = sumAmounts(rows.map((r) => r.amount))
  return rows
    .filter((r) => Math.round(r.amount) !== 0)
    .sort((a, b) => b.amount - a.amount)
    .map((r) => ({ ...r, ratio: total ? r.amount / total : 0 }))
}

export async function getSalesAnalysis({ year, month }: { year: number; month?: number | null }): Promise<SalesAnalysis> {
  const m = month && month >= 1 && month <= 12 ? month : null
  const entity = await getCurrentEntity()
  const period = and(eq(deal.entity, entity), isNull(deal.deletedAt), eq(deal.accrualYear, year), m ? eq(deal.accrualMonth, m) : undefined)
  const sumSales = sql<string>`coalesce(sum(${salesGross}), 0)::text`
  const sumPurchase = sql<string>`coalesce(sum(${purchaseGross}), 0)::text`
  const hasSales = sql`${salesGross} is not null and ${salesGross} <> 0`
  const hasPurchase = sql`${purchaseGross} is not null and ${purchaseGross} <> 0`
  const n = sql<number>`count(*)::int`

  const [clients, categories, owners, suppliers, cumulativeRows] = await Promise.all([
    db
      .select({ id: deal.issuerCounterpartyId, name: counterparty.name, clientType: counterparty.clientType, amount: sumSales, count: n })
      .from(deal)
      .leftJoin(counterparty, eq(counterparty.id, deal.issuerCounterpartyId))
      .where(and(period, hasSales))
      .groupBy(deal.issuerCounterpartyId, counterparty.name, counterparty.clientType),
    db
      .select({ id: deal.categoryId, name: dealCategory.nameKo, amount: sumSales, count: n })
      .from(deal)
      .leftJoin(dealCategory, eq(dealCategory.id, deal.categoryId))
      .where(and(period, hasSales))
      .groupBy(deal.categoryId, dealCategory.nameKo),
    db
      .select({ id: deal.ownerUserId, name: users.name, amount: sumSales, count: n })
      .from(deal)
      .leftJoin(users, eq(users.id, deal.ownerUserId))
      .where(and(period, hasSales))
      .groupBy(deal.ownerUserId, users.name),
    db
      .select({ id: deal.supplierCounterpartyId, name: counterparty.name, amount: sumPurchase, count: n })
      .from(deal)
      .leftJoin(counterparty, eq(counterparty.id, deal.supplierCounterpartyId))
      .where(and(period, hasPurchase))
      .groupBy(deal.supplierCounterpartyId, counterparty.name),
    db
      .select({
        owner: users.name,
        team: users.team,
        sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
        profit: sql<string>`coalesce(sum(${deal.profit}), 0)::text`,
      })
      .from(deal)
      .leftJoin(users, eq(users.id, deal.ownerUserId))
      .where(and(eq(deal.entity, entity), isNull(deal.deletedAt), eq(deal.accrualYear, year)))
      .groupBy(users.name, users.team),
  ])

  const byClient = withRatio(
    clients.map((r) => ({
      key: r.id ?? 'none',
      counterpartyId: r.id,
      label: r.name ?? '(발행처 미지정)',
      clientType: r.clientType,
      clientTypeLabel: clientTypeLabel(r.clientType),
      amount: num(r.amount),
      count: r.count,
    })),
  )

  const typeMap = new Map<string, { amount: number; count: number }>()
  for (const r of byClient) {
    const cur = typeMap.get(r.clientTypeLabel) ?? { amount: 0, count: 0 }
    typeMap.set(r.clientTypeLabel, { amount: cur.amount + r.amount, count: cur.count + r.count })
  }
  const byClientType = withRatio([...typeMap].map(([label, v]) => ({ key: label, label, ...v })))

  const simple = (rows: { id: string | number | null; name: string | null; amount: string; count: number }[], empty: string) =>
    withRatio(rows.map((r) => ({ key: String(r.id ?? 'none'), label: r.name ?? empty, amount: num(r.amount), count: r.count })))

  const mkRow = (owner: string, sales: number, profit: number): CumulativeRow => ({ owner, sales, profit, margin: sales ? profit / sales : null })
  const teams = new Map<string, CumulativeRow[]>()
  for (const r of cumulativeRows) {
    const sales = num(r.sales)
    const profit = num(r.profit)
    if (Math.round(sales) === 0 && Math.round(profit) === 0) continue
    const team = r.team ?? '(팀 미지정)'
    ;(teams.get(team) ?? teams.set(team, []).get(team)!).push(mkRow(r.owner ?? '(담당자 없음)', sales, profit))
  }
  const order = (t: string) => (TEAM_ORDER.includes(t) ? TEAM_ORDER.indexOf(t) : 99)
  const groups: CumulativeGroup[] = [...teams]
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0], 'ko'))
    .map(([team, rows]) => ({
      team,
      title: TEAM_TITLE[team] ?? team,
      rows: rows.sort((a, b) => b.sales - a.sales),
      total: mkRow('총합계', sumAmounts(rows.map((r) => r.sales)), sumAmounts(rows.map((r) => r.profit))),
    }))

  return {
    year,
    month: m,
    salesTotal: sumAmounts(clients.map((r) => num(r.amount))),
    purchaseTotal: sumAmounts(suppliers.map((r) => num(r.amount))),
    byClient,
    byClientType,
    byCategory: simple(categories, '(상품구분 없음)'),
    byOwner: simple(owners, '(담당자 없음)'),
    bySupplier: simple(suppliers, '(매체사 미지정)'),
    cumulative: {
      groups,
      total: mkRow('전체', sumAmounts(groups.map((g) => g.total.sales)), sumAmounts(groups.map((g) => g.total.profit))),
    },
  }
}
