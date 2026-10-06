'use server'

import { and, desc, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { counterparty, deal, expense, expenseCategory, users } from '@/lib/db/schema'
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
      .where(and(isNull(expense.deletedAt), eq(expense.year, year), inArray(expense.month, months), eq(expense.expenseCategoryId, categoryId)))
      .orderBy(desc(expense.amount))
    const list = rows.map((r) => ({ ...r, amount: num(r.amount) }))
    return { kind: 'expenses', basis: '지출일의 연·월이 이 달이고 거래항목이 이 과목인 판관비', rows: list, total: sumAmounts(list.map((r) => r.amount)) }
  }

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
    .where(and(isNull(deal.deletedAt), s.where))
  const list = rows
    .map((r) => ({ ...r, net: num(r.net), vat: num(r.vat), amount: num(r.amount) }))
    // 합계에 영향이 없는 0원 거래는 빼고, 큰 금액부터
    .filter((r) => r.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  return { kind: 'deals', basis, side: s.side, dateLabel: s.dateLabel, rows: list, total: sumAmounts(list.map((r) => r.amount)) }
}
