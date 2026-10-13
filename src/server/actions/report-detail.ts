'use server'

import { and, desc, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { getCurrentEntity } from '@/server/entity'
import { counterparty, deal, dealCategory, expense, expenseCategory, users } from '@/lib/db/schema'
import { PLAN_GROUPS } from '@/lib/plan-groups'
import { LEAF_BASIS, sumAmounts, type DrillDetail } from '@/lib/ledger-drill'
import { canAccessBackoffice, getSessionUser } from '@/server/auth/guards'

const input = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  months: z.array(z.coerce.number().int().min(1).max(12)).min(1).max(12),
  key: z.string().min(1).max(40),
})

const num = (v: string | null | undefined) => parseFloat(v ?? '0') || 0

/**
 * 리포트 칸의 근거 내역 (2026-10-06 요청) — 매출장표·월별 수금결산의 숫자 하나가 어떤 거래·지출로 이루어졌는지.
 * 조건은 각 리포트 쿼리(reports-ledger.ts, reports-collection.ts)와 같아야 한다 — 여기 합계가 칸 값과 다르면 화면에 경고가 뜬다.
 */
export async function getReportCellDetail(raw: unknown): Promise<DrillDetail | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canAccessBackoffice(user.role)) return { error: '권한이 없습니다' }
  const parsed = input.safeParse(raw)
  if (!parsed.success) return { error: '잘못된 요청입니다' }
  const { year, months, key } = parsed.data

  if (key.startsWith('cat_')) {
    const categoryId = Number(key.slice(4))
    if (!Number.isInteger(categoryId)) return { error: '잘못된 요청입니다' }
    const rows = await db
      .select({ id: expense.id, date: expense.expenseDate, itemName: expense.itemName, counterparty: expense.counterpartyText, category: expenseCategory.nameKo, amount: expense.amount })
      .from(expense)
      .leftJoin(expenseCategory, eq(expenseCategory.id, expense.expenseCategoryId))
      .where(and(eq(expense.entity, await getCurrentEntity()), isNull(expense.deletedAt), eq(expense.year, year), inArray(expense.month, months), eq(expense.expenseCategoryId, categoryId)))
      .orderBy(desc(expense.amount))
    const list = rows.map((r) => ({ ...r, amount: num(r.amount) }))
    return { kind: 'expenses', basis: '지출일의 연·월이 이 달이고 거래항목이 이 과목인 판관비', rows: list, total: sumAmounts(list.map((r) => r.amount)) }
  }

  if (key.startsWith('plan_')) return planCellDetail(year, key)

  const basis = LEAF_BASIS[key]
  if (!basis) return { error: '이 칸은 내역을 볼 수 없습니다' }

  const inMonths = (col: SQLWrapper) => sql`extract(year from ${col})::int = ${year} and extract(month from ${col})::int in ${months}`
  const settleYear = sql`coalesce(${deal.settlementYear}, extract(year from ${deal.purchaseDueDate})::int)`
  const settleMonth = sql`coalesce(${deal.settlementMonth}, extract(month from ${deal.purchaseDueDate})::int)`
  const settleLabel = sql<string>`coalesce(${deal.purchaseDueDate}::text, ${deal.settlementYear}::text || '-' || lpad(${deal.settlementMonth}::text, 2, '0'))`
  const accrualLabel = sql<string>`${deal.accrualYear}::text || '-' || lpad(${deal.accrualMonth}::text, 2, '0')`
  const accrualCond = and(eq(deal.accrualYear, year), inArray(deal.accrualMonth, months))

  // 칸별 조건: [매출/매입, 조건, 근거 날짜, 날짜 이름]
  const spec: Record<string, { side: 'sales' | 'purchase'; where: SQL | undefined; date: SQL<string | null>; dateLabel: string }> = {
    sales_cash: { side: 'sales', where: and(eq(deal.salesPaidStatus, 'completed'), inMonths(deal.salesPaidDate)), date: sql<string | null>`${deal.salesPaidDate}::text`, dateLabel: '입금일' },
    sales_accrual: { side: 'sales', where: accrualCond, date: accrualLabel, dateLabel: '귀속월' },
    cogs_cash: { side: 'purchase', where: and(eq(deal.purchasePaidStatus, 'completed'), inMonths(deal.purchasePaidDate)), date: sql<string | null>`${deal.purchasePaidDate}::text`, dateLabel: '지급일' },
    cogs_accrual: { side: 'purchase', where: accrualCond, date: accrualLabel, dateLabel: '귀속월' },
    col_sales_planned: { side: 'sales', where: inMonths(deal.salesDueDate), date: sql<string | null>`${deal.salesDueDate}::text`, dateLabel: '입금예정일' },
    col_sales_collected: { side: 'sales', where: and(eq(deal.salesPaidStatus, 'completed'), inMonths(deal.salesPaidDate)), date: sql<string | null>`${deal.salesPaidDate}::text`, dateLabel: '입금일' },
    col_sales_outstanding: { side: 'sales', where: and(sql`${deal.salesPaidStatus} <> 'completed'`, inMonths(deal.salesDueDate)), date: sql<string | null>`${deal.salesDueDate}::text`, dateLabel: '입금예정일' },
    col_purchase_planned: { side: 'purchase', where: sql`(${settleYear} = ${year} and ${settleMonth} in ${months})`, date: settleLabel, dateLabel: '결산예정' },
    col_purchase_settled: { side: 'purchase', where: and(eq(deal.purchasePaidStatus, 'completed'), inMonths(deal.purchasePaidDate)), date: sql<string | null>`${deal.purchasePaidDate}::text`, dateLabel: '지급일' },
    col_purchase_outstanding: { side: 'purchase', where: and(sql`${deal.purchasePaidStatus} <> 'completed'`, sql`(${settleYear} = ${year} and ${settleMonth} in ${months})`), date: settleLabel, dateLabel: '결산예정' },
  }
  const s = spec[key]
  const sales = s.side === 'sales'
  const gross = sales ? sql<string>`coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet})::text` : sql<string>`coalesce(${deal.purchaseAmountGross}, ${deal.purchaseAmountNet})::text`
  const issuer = alias(counterparty, 'issuer')
  const supplier = alias(counterparty, 'supplier')
  const rows = await db
    .select({
      id: deal.id,
      dealCode: deal.dealCode,
      accrual: accrualLabel,
      owner: users.name,
      issuer: issuer.name,
      supplier: supplier.name,
      itemName: deal.itemName,
      basisDate: s.date,
      status: sales ? deal.salesPaidStatus : deal.purchasePaidStatus,
      net: sales ? deal.salesAmountNet : deal.purchaseAmountNet,
      vat: sales ? deal.salesVat : deal.purchaseVat,
      amount: gross,
    })
    .from(deal)
    .leftJoin(users, eq(users.id, deal.ownerUserId))
    .leftJoin(issuer, eq(issuer.id, deal.issuerCounterpartyId))
    .leftJoin(supplier, eq(supplier.id, deal.supplierCounterpartyId))
    .where(and(eq(deal.entity, await getCurrentEntity()), isNull(deal.deletedAt), s.where))
  const list = rows
    .map((r) => ({ ...r, net: num(r.net), vat: num(r.vat), amount: num(r.amount) }))
    // 합계에 영향이 없는 0원 거래는 빼고, 큰 금액부터
    .filter((r) => r.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  return { kind: 'deals', basis, side: s.side, dateLabel: s.dateLabel, rows: list, total: sumAmounts(list.map((r) => r.amount)) }
}

/**
 * 매출목표 표의 달성치·수익 근거 (2026-10-13 요청) — reports-plan.ts 와 같은 조건:
 * 귀속연도가 이 해인 거래를 상품구분의 목표군(plan_group)으로 묶는다. 키: plan_{sales|profit}_{목표군|all|none}
 */
async function planCellDetail(year: number, key: string): Promise<DrillDetail | { error: string }> {
  const m = /^plan_(sales|profit)_([a-z0-9_]+)$/.exec(key)
  if (!m) return { error: '잘못된 요청입니다' }
  const [, measure, group] = m
  const codes: string[] = PLAN_GROUPS.map((g) => g.code)
  if (group !== 'all' && group !== 'none' && !codes.includes(group)) return { error: '잘못된 요청입니다' }

  const cats = await db.select({ id: dealCategory.id, planGroup: dealCategory.planGroup }).from(dealCategory)
  const mapped = cats.filter((c) => c.planGroup != null && codes.includes(c.planGroup)).map((c) => c.id)
  const inGroup = cats.filter((c) => c.planGroup === group).map((c) => c.id)
  const categoryCond =
    group === 'all'
      ? mapped.length ? inArray(deal.categoryId, mapped) : sql`false`
      : group === 'none'
        ? mapped.length ? sql`(${deal.categoryId} is null or ${deal.categoryId} not in ${mapped})` : undefined
        : inGroup.length ? inArray(deal.categoryId, inGroup) : sql`false`

  const issuer = alias(counterparty, 'issuer')
  const supplier = alias(counterparty, 'supplier')
  const accrualLabel = sql<string>`${deal.accrualYear}::text || '-' || lpad(${deal.accrualMonth}::text, 2, '0')`
  const rows = await db
    .select({
      id: deal.id,
      dealCode: deal.dealCode,
      accrual: accrualLabel,
      owner: users.name,
      issuer: issuer.name,
      supplier: supplier.name,
      itemName: deal.itemName,
      basisDate: dealCategory.nameKo,
      status: deal.salesPaidStatus,
      sales: deal.salesAmountNet,
      purchase: deal.purchaseAmountNet,
      profit: deal.profit,
    })
    .from(deal)
    .leftJoin(users, eq(users.id, deal.ownerUserId))
    .leftJoin(issuer, eq(issuer.id, deal.issuerCounterpartyId))
    .leftJoin(supplier, eq(supplier.id, deal.supplierCounterpartyId))
    .leftJoin(dealCategory, eq(dealCategory.id, deal.categoryId))
    .where(and(eq(deal.entity, await getCurrentEntity()), isNull(deal.deletedAt), eq(deal.accrualYear, year), categoryCond))
  const sales = measure === 'sales'
  const list = rows
    .map(({ sales: s, purchase: p, profit: pr, ...r }) =>
      sales ? { ...r, net: num(p), vat: num(pr), amount: num(s) } : { ...r, net: num(s), vat: num(p), amount: num(pr) },
    )
    .filter((r) => r.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  return {
    kind: 'deals',
    basis: sales ? '귀속연도가 이 해이고 상품구분이 이 목표군인 거래 · 매출금(VAT 제외)' : '귀속연도가 이 해이고 상품구분이 이 목표군인 거래 · 손익(매출금 − 매입금)',
    side: 'sales',
    dateLabel: '상품구분',
    labels: sales ? { status: '입금', net: '매입금', vat: '손익', amount: '매출금' } : { status: '입금', net: '매출금', vat: '매입금', amount: '손익' },
    rows: list,
    total: sumAmounts(list.map((r) => r.amount)),
  }
}
