import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty, deal } from '@/lib/db/schema'

export type TopSort = 'sales' | 'profit'

export type TopCounterpartyFilters = {
  year?: number
  sort?: TopSort
  limit?: number
}

export type TopCounterpartyRow = {
  id: string
  name: string
  sales: number
  profit: number
  count: number
}

export async function getTopCounterparties(
  f: TopCounterpartyFilters = {},
): Promise<TopCounterpartyRow[]> {
  const limit = Math.min(100, Math.max(1, f.limit ?? 20))
  const sort: TopSort = f.sort === 'profit' ? 'profit' : 'sales'

  const conds = [isNull(deal.deletedAt), isNotNull(deal.issuerCounterpartyId)]
  if (f.year) conds.push(eq(deal.accrualYear, f.year))

  // 매출은 VAT 포함(총매출금), 손익은 공급가 (2026-09-15 고객 확정)
  const salesSum = sql`coalesce(sum(coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet})), 0)`
  const profitSum = sql`coalesce(sum(${deal.profit}), 0)`
  const salesExpr = sql<string>`${salesSum}::text`
  const profitExpr = sql<string>`${profitSum}::text`

  const rows = await db
    .select({
      id: deal.issuerCounterpartyId,
      name: counterparty.name,
      sales: salesExpr,
      profit: profitExpr,
      count: sql<number>`count(*)::int`,
    })
    .from(deal)
    .leftJoin(counterparty, eq(counterparty.id, deal.issuerCounterpartyId))
    .where(and(...conds))
    .groupBy(deal.issuerCounterpartyId, counterparty.name)
    // 숫자 합계로 정렬 (text 캐스팅 정렬 시 사전식 오정렬 방지)
    .orderBy(desc(sort === 'profit' ? profitSum : salesSum))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name ?? '(미지정)',
    sales: parseFloat(r.sales),
    profit: parseFloat(r.profit),
    count: r.count,
  }))
}
