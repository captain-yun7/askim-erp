import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { getCurrentEntity } from '@/server/entity'
import { counterparty } from '@/lib/db/schema'
import { compactText, looseLike } from '@/server/text-search'
import { isClientType } from '@/lib/client-type'

export type CounterpartyListFilters = { q?: string; role?: string; noBiz?: boolean; ctype?: string }

/** 거래처 목록 — 화면과 엑셀 내보내기가 같은 조건을 쓴다 (2026-10-21: 내보내기에 구분 필터가 빠져 있던 문제) */
export async function listCounterparties(f: CounterpartyListFilters) {
  const conds = [eq(counterparty.entity, await getCurrentEntity()), isNull(counterparty.deletedAt), eq(counterparty.isActive, true)]
  // 띄어쓰기 무시 검색 (2026-10-21 요청)
  if (f.q && compactText(f.q)) conds.push(or(looseLike(counterparty.name, f.q), looseLike(counterparty.businessNo, f.q))!)
  if (f.role) conds.push(sql`${counterparty.roleTags} @> ARRAY[${f.role}]::text[]`)
  // 거래처 구분 필터 (2026-09-28): 값 또는 'none'(미지정)
  if (f.ctype === 'none') conds.push(isNull(counterparty.clientType))
  else if (isClientType(f.ctype)) conds.push(eq(counterparty.clientType, f.ctype))
  if (f.noBiz) conds.push(or(isNull(counterparty.businessNo), eq(counterparty.businessNo, ''))!)
  return db
    .select({
      id: counterparty.id,
      name: counterparty.name,
      businessNo: counterparty.businessNo,
      roleTags: counterparty.roleTags,
      clientType: counterparty.clientType,
      paymentTerm: counterparty.paymentTerm,
      officialFeeRate: counterparty.officialFeeRate,
      bankName: counterparty.bankName,
      accountHolder: counterparty.accountHolder,
      accountNo: counterparty.accountNo,
      memo: counterparty.memo,
    })
    .from(counterparty)
    .where(and(...conds))
    // 전체 표시 (2026-10-14 요청) — 1천여 건이라 한 번에 그려도 충분
    .orderBy(asc(counterparty.name))
}

/** includeDeleted: 삭제된 거래처도 기존 거래의 표시용 이름으로는 필요 (거래 수정·복사 화면) */
export async function getCounterpartyById(id: string, opts: { includeDeleted?: boolean } = {}) {
  const [row] = await db
    .select()
    .from(counterparty)
    .where(and(eq(counterparty.id, id), eq(counterparty.entity, await getCurrentEntity()), opts.includeDeleted ? undefined : isNull(counterparty.deletedAt)))
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
  const conds = [eq(counterparty.entity, await getCurrentEntity()), isNull(counterparty.deletedAt), eq(counterparty.isActive, true)]
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
