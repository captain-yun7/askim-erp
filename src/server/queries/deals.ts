import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  account,
  counterparty,
  deal,
  dealCategory,
  users,
} from '@/lib/db/schema'

const issuerCp = sql<typeof counterparty>`issuer_cp`
const supplierCp = sql<typeof counterparty>`supplier_cp`

export type DealListFilters = {
  q?: string
  year?: number
  month?: number
  categoryId?: number
  ownerUserId?: string
  paidStatus?: 'pending' | 'completed' | 'partial' | 'unpaid' | 'unsettled' | 'all'
  page?: number
  pageSize?: number
}

export async function listDeals(f: DealListFilters = {}) {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(200, Math.max(10, f.pageSize ?? 50))

  const conds = [isNull(deal.deletedAt)]
  if (f.year) conds.push(eq(deal.accrualYear, f.year))
  if (f.month) conds.push(eq(deal.accrualMonth, f.month))
  if (f.categoryId) conds.push(eq(deal.categoryId, f.categoryId))
  if (f.ownerUserId) conds.push(eq(deal.ownerUserId, f.ownerUserId))
  if (f.paidStatus === 'unpaid') conds.push(eq(deal.salesPaidStatus, 'pending'))
  if (f.paidStatus === 'unsettled')
    conds.push(eq(deal.purchasePaidStatus, 'pending'))

  if (f.q) {
    const like = `%${f.q}%`
    conds.push(
      or(
        ilike(deal.dealCode, like),
        ilike(deal.itemName, like),
        sql`exists (select 1 from counterparty c where c.id in (${deal.issuerCounterpartyId}, ${deal.advertiserCounterpartyId}, ${deal.supplierCounterpartyId}) and c.name ilike ${like})`,
      )!,
    )
  }

  const where = and(...conds)

  // 카운트
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(deal)
    .where(where)

  // 합계
  const [aggr] = await db
    .select({
      sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
      purchase: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      profit: sql<string>`coalesce(sum(${deal.profit}), 0)::text`,
    })
    .from(deal)
    .where(where)

  // 목록 (조인)
  const rows = await db
    .select({
      id: deal.id,
      dealCode: deal.dealCode,
      accrualYear: deal.accrualYear,
      accrualMonth: deal.accrualMonth,
      currency: deal.currency,
      status: deal.status,
      itemName: deal.itemName,
      salesAmountNet: deal.salesAmountNet,
      purchaseAmountNet: deal.purchaseAmountNet,
      profit: deal.profit,
      salesPaidStatus: deal.salesPaidStatus,
      purchasePaidStatus: deal.purchasePaidStatus,
      salesDueDate: deal.salesDueDate,
      purchaseDueDate: deal.purchaseDueDate,
      categoryName: dealCategory.nameKo,
      ownerName: users.name,
      issuerName: sql<string | null>`(select name from counterparty where id = ${deal.issuerCounterpartyId})`,
      advertiserName: sql<string | null>`(select name from counterparty where id = ${deal.advertiserCounterpartyId})`,
      supplierName: sql<string | null>`(select name from counterparty where id = ${deal.supplierCounterpartyId})`,
    })
    .from(deal)
    .leftJoin(dealCategory, eq(dealCategory.id, deal.categoryId))
    .leftJoin(users, eq(users.id, deal.ownerUserId))
    .where(where)
    .orderBy(desc(deal.accrualYear), desc(deal.accrualMonth), desc(deal.dealCode))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    rows,
    total,
    page,
    pageSize,
    aggregate: {
      sales: parseFloat(aggr.sales),
      purchase: parseFloat(aggr.purchase),
      profit: parseFloat(aggr.profit),
    },
  }
}

export async function getDealById(id: string) {
  const [row] = await db
    .select()
    .from(deal)
    .where(and(eq(deal.id, id), isNull(deal.deletedAt)))
    .limit(1)
  return row ?? null
}
