/**
 * 띄어쓰기 상관없는 검색 (2026-10-21 요청) — "에이커뮤니케이션즈" 로 "에이 커뮤니케이션즈" 도, 그 반대도 찾는다.
 * 검색어와 값 양쪽의 공백을 모두 지우고 대소문자 무시 부분일치.
 */
export function compactText(v: string): string {
  return v.replace(/\s+/g, '')
}

/** like 패턴 — 검색어 속 % _ \ 는 글자 그대로 */
export function compactPattern(q: string): string {
  return `%${compactText(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/** 화면에서 거르는 목록용 — 같은 규칙의 JS 판정 */
export function looseIncludes(text: string | null | undefined, q: string): boolean {
  const needle = compactText(q).toLowerCase()
  if (!needle) return true
  return compactText(text ?? '').toLowerCase().includes(needle)
}
