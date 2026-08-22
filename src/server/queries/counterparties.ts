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

/** 상호 비교용 정규화: 공백·괄호·㈜·주식회사 제거 + 소문자 */
const NAME_NOISE = /\(주\)|（주）|주식회사|[\s()（）㈜]/g
function normalizeName(s: string) {
  return s.replace(NAME_NOISE, '').toLowerCase()
}

/** 거래처 자동완성. 빈 검색어면 상호순 상위 목록 반환 */
export async function searchCounterparties(q: string, limit = 20) {
  const term = normalizeName(q)
  const conds = [isNull(counterparty.deletedAt), eq(counterparty.isActive, true)]
  if (term) {
    const like = `%${term}%`
    conds.push(
      or(
        sql`regexp_replace(lower(${counterparty.name}), '\\(주\\)|（주）|주식회사|[[:space:]()（）㈜]', '', 'g') like ${like}`,
        ilike(counterparty.businessNo, `%${q.trim()}%`),
      )!,
    )
  }
  return db
    .select({
      id: counterparty.id,
      name: counterparty.name,
      businessNo: counterparty.businessNo,
    })
    .from(counterparty)
    .where(and(...conds))
    .orderBy(asc(counterparty.name))
    .limit(limit)
}
