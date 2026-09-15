import { and, asc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { deposit, exclusiveContract } from '@/lib/db/schema'
import type { SessionUser } from '@/server/auth/guards'

export const DEPOSIT_STATUS_LABEL: Record<string, string> = {
  held: '보유',
  returned: '반환완료',
  offset: '상계예정',
  unreturned: '미반환',
}

/** 팀원(영업·팀장 아님)은 본인 것만 — 담당자 FK 또는 담당자 이름 일치 (2026-09-09 피드백). 관리자·팀장·viewer 는 전체 */
function ownScope(user: SessionUser | null, ownerUserId: AnyPgColumn, ownerName: AnyPgColumn): SQL | undefined {
  if (!user || user.role !== 'sales' || user.isTeamLead) return undefined
  return or(eq(ownerUserId, user.id), user.name ? eq(ownerName, user.name) : sql`false`)!
}

export async function listDeposits(user: SessionUser | null = null) {
  const where = and(isNull(deposit.deletedAt), ownScope(user, deposit.ownerUserId, deposit.ownerName))
  const rows = await db
    .select()
    .from(deposit)
    .where(where)
    .orderBy(asc(deposit.displayOrder), asc(deposit.id))

  const [aggr] = await db
    .select({
      total: sql<string>`coalesce(sum(${deposit.amount}), 0)::text`,
      outstanding: sql<string>`coalesce(sum(${deposit.amount}) filter (where ${deposit.status} <> 'returned'), 0)::text`,
      count: sql<number>`count(*)::int`,
      outstandingCount: sql<number>`(count(*) filter (where ${deposit.status} <> 'returned'))::int`,
    })
    .from(deposit)
    .where(where)

  return {
    rows,
    total: parseFloat(aggr.total),
    outstanding: parseFloat(aggr.outstanding),
    count: aggr.count,
    outstandingCount: aggr.outstandingCount,
  }
}

export type ContractKind = 'exclusive' | 'asset'

export async function listExclusiveContracts(user: SessionUser | null = null, kind: ContractKind = 'exclusive') {
  return db
    .select()
    .from(exclusiveContract)
    .where(and(isNull(exclusiveContract.deletedAt), eq(exclusiveContract.kind, kind), ownScope(user, exclusiveContract.ownerUserId, exclusiveContract.ownerName)))
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
