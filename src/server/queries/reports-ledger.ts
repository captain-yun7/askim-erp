import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal, expense, expenseCategory, ledgerOverride } from '@/lib/db/schema'
import type { CostGroup } from '@/lib/cost-groups'

/**
 * 매출장표 — 엑셀 '매출장표' 시트 구조 (월 가로 × 항목 세로)
 *
 * 통장 기준   = 입금일/지급일 월 (현금주의)
 * 귀속월 기준 = 귀속연월 (발생주의)
 * 판관비      = 고정비 + 변동비 (expense_category.cost_group)
 * 판관비 외   = 세금 등 non_operating → 당기순이익에서 차감
 * 십일조      = 영업이익(통장) × 10%
 * 총매출(귀속월)·매출원가_귀속월은 ledger_override 로 수기 덮어쓰기 가능
 */

export type LedgerCategory = {
  id: number
  code: string
  nameKo: string
  costGroup: CostGroup
}

export type LedgerMonth = {
  month: number
  salesCash: number
  salesAccrual: number
  cogsCash: number
  cogsAccrual: number
  /** 수기 입력 여부 */
  salesAccrualOverridden: boolean
  cogsAccrualOverridden: boolean
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
  const [accrualRows, cashSales, cashPurchase, expenseRows, categories, overrides] = await Promise.all([
    db
      .select({
        month: deal.accrualMonth,
        sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
        purchase: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(and(isNull(deal.deletedAt), eq(deal.accrualYear, year)))
      .groupBy(deal.accrualMonth),
    db
      .select({
        month: sql<number>`extract(month from ${deal.salesPaidDate})::int`,
        sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
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
        purchase: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
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
    db.select().from(ledgerOverride).where(eq(ledgerOverride.year, year)),
  ])

  const months: LedgerMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    salesCash: 0,
    salesAccrual: 0,
    cogsCash: 0,
    cogsAccrual: 0,
    salesAccrualOverridden: false,
    cogsAccrualOverridden: false,
    expenses: {},
  }))
  const at = (m: number | null) => (m && m >= 1 && m <= 12 ? months[m - 1] : null)

  for (const r of accrualRows) {
    const slot = at(r.month)
    if (!slot) continue
    slot.salesAccrual = num(r.sales)
    slot.cogsAccrual = num(r.purchase)
  }
  for (const r of cashSales) {
    const slot = at(r.month)
    if (slot) slot.salesCash = num(r.sales)
  }
  for (const r of cashPurchase) {
    const slot = at(r.month)
    if (slot) slot.cogsCash = num(r.purchase)
  }
  for (const r of expenseRows) {
    const slot = at(r.month)
    if (!slot || r.categoryId == null) continue
    slot.expenses[r.categoryId] = (slot.expenses[r.categoryId] ?? 0) + num(r.amount)
  }
  // 수기 override 적용 — 파생 행(손익·영업이익·당기순이익)도 이 값 기준으로 계산됨
  for (const o of overrides) {
    const slot = at(o.month)
    if (!slot) continue
    if (o.field === 'sales_accrual') {
      slot.salesAccrual = num(o.amount)
      slot.salesAccrualOverridden = true
    } else {
      slot.cogsAccrual = num(o.amount)
      slot.cogsAccrualOverridden = true
    }
  }

  return { year, categories, months }
}

// ── 파생 행 계산 (화면/CSV 공용) ──────────────────────────

export type LedgerLine = {
  key: string
  label: string
  /** 수기 입력 가능 행 — 셀 편집 대상 필드명 */
  editableField?: 'sales_accrual' | 'cogs_accrual'
  /** 월별 수기 입력 여부 (editableField 행만) */
  overridden?: boolean[]
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

  const fixed = byGroup('fixed')
  const variable = byGroup('variable')
  const nonOp = byGroup('non_operating')

  const fixedTotal = sumOf(fixed.map((c) => c.id))
  const variableTotal = sumOf(variable.map((c) => c.id))
  const sgna = fixedTotal.map((v, i) => v + variableTotal[i])
  const nonOpTotal = sumOf(nonOp.map((c) => c.id))

  const grossCash = sub(salesCash, cogsCash)
  const grossAccrual = sub(salesAccrual, cogsAccrual)
  const opCash = sub(grossCash, sgna)
  const opAccrual = sub(grossAccrual, sgna)
  const netCash = sub(opCash, nonOpTotal)
  const netAccrual = sub(opAccrual, nonOpTotal)
  const tithe = opCash.map((v) => v * 0.1)

  const salesOv = months.map((m) => m.salesAccrualOverridden)
  const cogsOv = months.map((m) => m.cogsAccrualOverridden)

  const lines: LedgerLine[] = [
    { key: 'sales_cash', label: '총매출(통장)', level: 0, tone: 'sales', values: salesCash },
    { key: 'sales_accrual', label: '총매출(귀속월)', level: 0, tone: 'sales', values: salesAccrual, editableField: 'sales_accrual', overridden: salesOv },
    // 수기 입력 대상이라 총매출(귀속월) 바로 아래 배치 (2026-08-25 회의)
    { key: 'cogs_accrual', label: '(매출원가)_귀속월', level: 2, tone: 'muted', values: cogsAccrual, pctBase: salesAccrual, editableField: 'cogs_accrual', overridden: cogsOv },
    { key: 'gross_cash', label: '손익(통장)', level: 0, tone: 'profit', values: grossCash, pctBase: salesCash },
    { key: 'gross_accrual', label: '손익(귀속월)', level: 0, tone: 'profit', values: grossAccrual, pctBase: salesAccrual },
    { key: 'cogs_cash', label: '(매출원가)_통장', level: 2, tone: 'muted', values: cogsCash, pctBase: salesCash },
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
