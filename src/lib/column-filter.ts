/**
 * 거래 목록 컬럼별 검색식 파서 (2026-09-07 피드백: 금액·날짜·상태 컬럼도 검색)
 *
 * 금액:  `800000` `800,000` 정확히 / `>1000000` `>=` `<` `<=` 비교 / `100000~500000` 범위 / `-` 비어있음
 * 날짜:  `2026` `2026-09` `2026-09-05` 앞부분 일치 / `2026-09-01~2026-09-15` 범위 / `-` 비어있음
 *        구분자는 `-` `.` `/` 또는 없음(20260905) 모두 허용
 */

export type NumberFilter =
  | { kind: 'empty' }
  | { kind: 'cmp'; op: '=' | '>' | '>=' | '<' | '<='; value: number }
  | { kind: 'range'; min: number; max: number }

export type DateFilter =
  | { kind: 'empty' }
  /** from 이상 toExclusive 미만 (YYYY-MM-DD) */
  | { kind: 'range'; from: string; toExclusive: string }

const toNumber = (raw: string): number | null => {
  const cleaned = raw.replace(/[,\s₩원]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseNumberFilter(raw: string | undefined): NumberFilter | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  if (s === '-') return { kind: 'empty' }

  const range = s.split('~')
  if (range.length === 2) {
    const min = toNumber(range[0])
    const max = toNumber(range[1])
    if (min == null || max == null) return null
    return { kind: 'range', min: Math.min(min, max), max: Math.max(min, max) }
  }

  const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(s)
  if (!m) return null
  const value = toNumber(m[2])
  if (value == null) return null
  const op = (m[1] as '=' | '>' | '>=' | '<' | '<=' | undefined) ?? '='
  return { kind: 'cmp', op, value }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 부분 날짜 → [from, toExclusive). 잘못된 값이면 null */
function datePeriod(raw: string): { from: string; toExclusive: string } | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length !== 4 && digits.length !== 6 && digits.length !== 8) return null
  const y = Number(digits.slice(0, 4))
  const mo = digits.length >= 6 ? Number(digits.slice(4, 6)) : null
  const d = digits.length === 8 ? Number(digits.slice(6, 8)) : null
  if (y < 1900 || y > 2999) return null
  if (mo != null && (mo < 1 || mo > 12)) return null
  if (d != null && (d < 1 || d > 31)) return null

  if (mo == null) return { from: `${y}-01-01`, toExclusive: `${y + 1}-01-01` }
  if (d == null) {
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`
    return { from: `${y}-${pad(mo)}-01`, toExclusive: next }
  }
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null
  const nextDt = new Date(Date.UTC(y, mo - 1, d + 1))
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  return { from: iso(dt), toExclusive: iso(nextDt) }
}

export function parseDateFilter(raw: string | undefined): DateFilter | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  if (s === '-') return { kind: 'empty' }

  const range = s.split('~')
  if (range.length === 2) {
    const a = datePeriod(range[0].trim())
    const b = datePeriod(range[1].trim())
    if (!a || !b) return null
    return { kind: 'range', from: a.from, toExclusive: b.toExclusive }
  }
  const p = datePeriod(s)
  return p ? { kind: 'range', ...p } : null
}
