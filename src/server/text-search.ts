import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { compactPattern } from '@/lib/text-search'

export { compactText } from '@/lib/text-search'

/** 띄어쓰기 무시 검색 (2026-10-21) — 컬럼(또는 식)의 공백을 지운 값이 검색어(공백 제거)를 포함, 대소문자 무시 */
export function looseLike(col: SQLWrapper, q: string): SQL {
  return sql`regexp_replace(${col}, '\\s', '', 'g') ilike ${compactPattern(q)}`
}
