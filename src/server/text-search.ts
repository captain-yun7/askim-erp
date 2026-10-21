import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { compactPattern } from '@/lib/text-search'

export { compactText } from '@/lib/text-search'

/** 띄어쓰기 무시 검색 (2026-10-21) — 컬럼(또는 식)의 공백을 지운 값이 검색어(공백 제거)를 포함, 대소문자 무시 */
export function looseLike(col: SQLWrapper, q: string): SQL {
  // Postgres 의 \s 는 줄바꿈 없는 공백(NBSP)·전각 공백을 못 지울 수 있어 직접 넣는다 — JS \s 와 같게
  return sql`regexp_replace(${col}, ${'[[:space:]\u00a0\u3000\ufeff]'}, '', 'g') ilike ${compactPattern(q)}`
}
