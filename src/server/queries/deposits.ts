import { and, asc, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deposit, exclusiveContract } from '@/lib/db/schema'

export const DEPOSIT_STATUS_LABEL: Record<string, string> = {
  held: '보유',
  returned: '반환완료',
  offset: '상계예정',
  unreturned: '미반환',
}

export async function listDeposits() {
  const rows = await db
    .select()
    .from(deposit)
    .where(isNull(deposit.deletedAt))
    .orderBy(asc(deposit.displayOrder), asc(deposit.id))

  const [aggr] = await db
    .select({
      total: sql<string>`coalesce(sum(${deposit.amount}), 0)::text`,
      outstanding: sql<string>`coalesce(sum(${deposit.amount}) filter (where ${deposit.status} <> 'returned'), 0)::text`,
      count: sql<number>`count(*)::int`,
      outstandingCount: sql<number>`(count(*) filter (where ${deposit.status} <> 'returned'))::int`,
    })
    .from(deposit)
    .where(isNull(deposit.deletedAt))

  return {
    rows,
    total: parseFloat(aggr.total),
    outstanding: parseFloat(aggr.outstanding),
    count: aggr.count,
    outstandingCount: aggr.outstandingCount,
  }
}

export async function listExclusiveContracts() {
  return db
    .select()
    .from(exclusiveContract)
    .where(isNull(exclusiveContract.deletedAt))
    .orderBy(asc(exclusiveContract.displayOrder), asc(exclusiveContract.id))
}

export async function getDepositById(id: number) {
  const [row] = await db
    .select()
    .from(deposit)
    .where(and(sql`${deposit.id} = ${id}`, isNull(deposit.deletedAt)))
    .limit(1)
  return row ?? null
}
