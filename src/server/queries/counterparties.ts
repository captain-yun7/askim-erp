import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty } from '@/lib/db/schema'

export async function listCounterparties(opts?: {
  q?: string
  role?: 'media' | 'advertiser' | 'agency'
  limit?: number
}) {
  const conds = [isNull(counterparty.deletedAt), eq(counterparty.isActive, true)]
  if (opts?.q) {
    conds.push(ilike(counterparty.name, `%${opts.q}%`))
  }
  return db
    .select({
      id: counterparty.id,
      name: counterparty.name,
      businessNo: counterparty.businessNo,
      roleTags: counterparty.roleTags,
      paymentTerm: counterparty.paymentTerm,
    })
    .from(counterparty)
    .where(and(...conds))
    .orderBy(asc(counterparty.name))
    .limit(opts?.limit ?? 20)
}

export async function getCounterpartyById(id: string) {
  const [row] = await db
    .select()
    .from(counterparty)
    .where(and(eq(counterparty.id, id), isNull(counterparty.deletedAt)))
    .limit(1)
  return row ?? null
}

export async function searchCounterparties(q: string, limit = 10) {
  if (!q.trim()) return []
  const like = `%${q.trim()}%`
  return db
    .select({
      id: counterparty.id,
      name: counterparty.name,
      businessNo: counterparty.businessNo,
    })
    .from(counterparty)
    .where(
      and(
        isNull(counterparty.deletedAt),
        or(ilike(counterparty.name, like), ilike(counterparty.businessNo, like)),
      ),
    )
    .orderBy(asc(counterparty.name))
    .limit(limit)
}
