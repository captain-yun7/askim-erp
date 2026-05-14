/** 한국식 통화 포맷 */
export function formatKRW(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '-'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '-'
  return n.toLocaleString('ko-KR')
}

/** 큰 수 → 만/억 단위 (8,200,000 → 820만, 4,800,000,000 → 48억) */
export function formatKRWShort(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '-'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '-'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(abs >= 1e9 ? 0 : 1)}억`
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}만`
  return `${sign}${abs}`
}

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return '-'
  if (typeof v === 'string') return v.slice(0, 10)
  return v.toISOString().slice(0, 10)
}
