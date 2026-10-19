/** 결산연월일 (2026-10-14 요청: 결산연월 → 결산연월일). 결산일은 비어 있을 수 있다 — 그때는 연월만 */
export function formatSettlement(year: number | null | undefined, month: number | null | undefined, day?: number | null): string {
  if (!year || !month) return '-'
  const ym = `${year}-${String(month).padStart(2, '0')}`
  return day ? `${ym}-${String(day).padStart(2, '0')}` : ym
}

/** 'YYYY-MM-DD' 또는 'YYYY-MM' → 값, 빈 문자열 → 모두 null, 그 외(없는 날짜 포함) → null 반환으로 거부 */
export function parseSettlement(text: string): { year: number | null; month: number | null; day: number | null } | null {
  const t = text.trim()
  if (t === '') return { year: null, month: null, day: null }
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(t)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null]
  if (month < 1 || month > 12 || !isValidSettlementDay(year, month, day)) return null
  return { year, month, day }
}

export function isValidSettlementDay(year: number | null | undefined, month: number | null | undefined, day: number | null | undefined): boolean {
  if (day == null) return true
  if (!year || !month) return false
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}
