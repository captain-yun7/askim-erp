import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal, expense, expenseCategory } from '@/lib/db/schema'
import type { CostGroup } from '@/lib/cost-groups'

/**
 * 매출장표 — 엑셀 '매출장표' 시트 구조 (월 가로 × 항목 세로)
 *
 * 통장 기준   = 입금일/지급일 월 (현금주의)
 * 귀속월 기준 = 귀속연월 (발생주의)
 * 판관비      = 고정비 + 변동비 (expense_category.cost_group)
 * 판관비 외   = 세금 등 non_operating → 당기순이익에서 차감
 * 십일조      = 영업이익(통장) × 10%
 *
 * 금액 기준 (2026-09-15 고객 확정): 총매출·매출원가는 VAT 포함(총매출금·총매입금), 손익은 공급가(매출금 − 매입금).
 * 귀속월 수기 덮어쓰기(ledger_override)는 폐지 — 엑셀 수식과 같이 자동 집계만 사용.
 */

export type LedgerCategory = {
  id: number
  code: string
  nameKo: string
  costGroup: CostGroup
}

export type LedgerMonth = {
  month: number
  /** VAT 포함 (총매출금·총매입금) */
  salesCash: number
  salesAccrual: number
  cogsCash: number
  cogsAccrual: number
  /** 공급가 (매출금·매입금) — 손익 계산용 */
  salesCashNet: number
  salesAccrualNet: number
  cogsCashNet: number
  cogsAccrualNet: number
  /** expense_category.id → 금액 */
  expenses: Record<number, number>
}

export type LedgerReport = {
  year: number
  categories: LedgerCategory[]
  months: LedgerMonth[]
}

const num = (v: string | null | undefined) => parseFloat(v ?? '0') || 0

export async function getSalesLedger({ year }: { year: number }): Promise<LedgerReport> {
  const salesGross = sql`coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet})`
  const purchaseGross = sql`coalesce(${deal.purchaseAmountGross}, ${deal.purchaseAmountNet})`
  const [accrualRows, cashSales, cashPurchase, expenseRows, categories] = await Promise.all([
    db
      .select({
        month: deal.accrualMonth,
        sales: sql<string>`coalesce(sum(${salesGross}), 0)::text`,
        purchase: sql<string>`coalesce(sum(${purchaseGross}), 0)::text`,
        salesNet: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
        purchaseNet: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(and(isNull(deal.deletedAt), eq(deal.accrualYear, year)))
      .groupBy(deal.accrualMonth),
    db
      .select({
        month: sql<number>`extract(month from ${deal.salesPaidDate})::int`,
        sales: sql<string>`coalesce(sum(${salesGross}), 0)::text`,
        salesNet: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(
        and(
          isNull(deal.deletedAt),
          sql`extract(year from ${deal.salesPaidDate})::int = ${year}`,
        ),
      )
      .groupBy(sql`extract(month from ${deal.salesPaidDate})`),
    db
      .select({
        month: sql<number>`extract(month from ${deal.purchasePaidDate})::int`,
        purchase: sql<string>`coalesce(sum(${purchaseGross}), 0)::text`,
        purchaseNet: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(
        and(
          isNull(deal.deletedAt),
          sql`extract(year from ${deal.purchasePaidDate})::int = ${year}`,
        ),
      )
      .groupBy(sql`extract(month from ${deal.purchasePaidDate})`),
    db
      .select({
        month: expense.month,
        categoryId: expense.expenseCategoryId,
        amount: sql<string>`coalesce(sum(${expense.amount}), 0)::text`,
      })
      .from(expense)
      .where(and(isNull(expense.deletedAt), eq(expense.year, year)))
      .groupBy(expense.month, expense.expenseCategoryId),
    db
      .select({
        id: expenseCategory.id,
        code: expenseCategory.code,
        nameKo: expenseCategory.nameKo,
        costGroup: expenseCategory.costGroup,
      })
      .from(expenseCategory)
      .where(sql`${expenseCategory.costGroup} <> 'excluded'`)
      .orderBy(asc(expenseCategory.displayOrder)),
  ])

  const months: LedgerMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    salesCash: 0,
    salesAccrual: 0,
    cogsCash: 0,
    cogsAccrual: 0,
    salesCashNet: 0,
    salesAccrualNet: 0,
    cogsCashNet: 0,
    cogsAccrualNet: 0,
    expenses: {},
  }))
  const at = (m: number | null) => (m && m >= 1 && m <= 12 ? months[m - 1] : null)

  for (const r of accrualRows) {
    const slot = at(r.month)
    if (!slot) continue
    slot.salesAccrual = num(r.sales)
    slot.cogsAccrual = num(r.purchase)
    slot.salesAccrualNet = num(r.salesNet)
    slot.cogsAccrualNet = num(r.purchaseNet)
  }
  for (const r of cashSales) {
    const slot = at(r.month)
    if (slot) {
      slot.salesCash = num(r.sales)
      slot.salesCashNet = num(r.salesNet)
    }
  }
  for (const r of cashPurchase) {
    const slot = at(r.month)
    if (slot) {
      slot.cogsCash = num(r.purchase)
      slot.cogsCashNet = num(r.purchaseNet)
    }
  }
  for (const r of expenseRows) {
    const slot = at(r.month)
    if (!slot || r.categoryId == null) continue
    slot.expenses[r.categoryId] = (slot.expenses[r.categoryId] ?? 0) + num(r.amount)
  }
  return { year, categories, months }
}

// ── 파생 행 계산 (화면/CSV 공용) ──────────────────────────

export type LedgerLine = {
  key: string
  label: string
  /** 들여쓰기 수준: 0 주요 행, 1 소계, 2 과목 */
  level: 0 | 1 | 2
  /** 강조 스타일 */
  tone?: 'sales' | 'profit' | 'operating' | 'net' | 'muted'
  /** 월별 값 (index 0 = 1월) */
  values: number[]
  /** (%) 분모 — 월별 값. 없으면 % 미표시 */
  pctBase?: number[]
}

export function buildLedgerLines(report: LedgerReport): LedgerLine[] {
  const { categories, months } = report
  const byGroup = (g: CostGroup) => categories.filter((c) => c.costGroup === g)
  const catValues = (id: number) => months.map((m) => m.expenses[id] ?? 0)
  const sumOf = (ids: number[]) =>
    months.map((m) => ids.reduce((acc, id) => acc + (m.expenses[id] ?? 0), 0))
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i])

  const salesCash = months.map((m) => m.salesCash)
  const salesAccrual = months.map((m) => m.salesAccrual)
  const cogsCash = months.map((m) => m.cogsCash)
  const cogsAccrual = months.map((m) => m.cogsAccrual)
  // 손익은 공급가 기준 (2026-09-15 고객 확정)
  const salesCashNet = months.map((m) => m.salesCashNet)
  const salesAccrualNet = months.map((m) => m.salesAccrualNet)
  const cogsCashNet = months.map((m) => m.cogsCashNet)
  const cogsAccrualNet = months.map((m) => m.cogsAccrualNet)

  const fixed = byGroup('fixed')
  const variable = byGroup('variable')
  const nonOp = byGroup('non_operating')

  const fixedTotal = sumOf(fixed.map((c) => c.id))
  const variableTotal = sumOf(variable.map((c) => c.id))
  const sgna = fixedTotal.map((v, i) => v + variableTotal[i])
  const nonOpTotal = sumOf(nonOp.map((c) => c.id))

  const grossCash = sub(salesCashNet, cogsCashNet)
  const grossAccrual = sub(salesAccrualNet, cogsAccrualNet)
  const opCash = sub(grossCash, sgna)
  const opAccrual = sub(grossAccrual, sgna)
  const netCash = sub(opCash, nonOpTotal)
  const netAccrual = sub(opAccrual, nonOpTotal)
  const tithe = opCash.map((v) => v * 0.1)

  const lines: LedgerLine[] = [
    { key: 'sales_cash', label: '총매출(통장)', level: 0, tone: 'sales', values: salesCash },
    { key: 'sales_accrual', label: '총매출(귀속월)', level: 0, tone: 'sales', values: salesAccrual },
    // 매출원가 2행은 총매출(귀속월) 바로 아래 통장→귀속월 순으로 묶음 (2026-09-07 피드백)
    { key: 'cogs_cash', label: '(매출원가)_통장', level: 2, tone: 'muted', values: cogsCash, pctBase: salesCash },
    { key: 'cogs_accrual', label: '(매출원가)_귀속월', level: 2, tone: 'muted', values: cogsAccrual, pctBase: salesAccrual },
    { key: 'gross_cash', label: '손익(통장)', level: 0, tone: 'profit', values: grossCash, pctBase: salesCash },
    { key: 'gross_accrual', label: '손익(귀속월)', level: 0, tone: 'profit', values: grossAccrual, pctBase: salesAccrual },
    { key: 'op_cash', label: '영업이익(통장)', level: 0, tone: 'operating', values: opCash, pctBase: salesCash },
    { key: 'op_accrual', label: '영업이익(귀속월)', level: 0, tone: 'operating', values: opAccrual, pctBase: salesAccrual },
    { key: 'sgna', label: '판매비와관리비', level: 0, values: sgna, pctBase: salesCash },
    { key: 'fixed', label: '- 고정비', level: 1, values: fixedTotal, pctBase: salesCash },
    ...fixed.map((c) => ({
      key: `cat_${c.id}`,
      label: `(${c.nameKo})`,
      level: 2 as const,
      values: catValues(c.id),
      pctBase: salesCash,
    })),
    { key: 'variable', label: '- 변동비', level: 1, values: variableTotal, pctBase: salesCash },
    ...variable.map((c) => ({
      key: `cat_${c.id}`,
      label: `(${c.nameKo})`,
      level: 2 as const,
      values: catValues(c.id),
      pctBase: salesCash,
    })),
    ...nonOp.map((c) => ({
      key: `cat_${c.id}`,
      label: `(${c.nameKo})`,
      level: 2 as const,
      values: catValues(c.id),
      pctBase: salesCash,
    })),
    { key: 'net_cash', label: '당기순이익(통장)', level: 0, tone: 'net', values: netCash, pctBase: salesCash },
    { key: 'net_accrual', label: '당기순이익(귀속월)', level: 0, tone: 'net', values: netAccrual, pctBase: salesAccrual },
    { key: 'tithe', label: '십일조', level: 0, tone: 'muted', values: tithe },
  ]
  return lines
}
