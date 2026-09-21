/**
 * 느슨한 날짜 입력 해석 (2026-09-17 피드백: "260917 만 쳐도 2026-09-17").
 *   260917 · 20260917 · 26-9-17 · 2026.09.17 · 2026/9/17 → 'YYYY-MM-DD'
 * 두 자리 연도는 2000년대로 본다. 빈 문자열은 null, 해석 불가·없는 날짜는 'invalid'.
 */
export function parseLooseDate(raw: string): string | null | 'invalid' {
  const s = raw.trim()
  if (s === '') return null
  let y: number, m: number, d: number
  const digits = s.replace(/\D/g, '')
  if (/^\d+$/.test(s)) {
    if (digits.length === 6) [y, m, d] = [2000 + Number(digits.slice(0, 2)), Number(digits.slice(2, 4)), Number(digits.slice(4, 6))]
    else if (digits.length === 8) [y, m, d] = [Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8))]
    else return 'invalid'
  } else {
    const parts = s.split(/[-./\s]+/).filter(Boolean)
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return 'invalid'
    y = Number(parts[0])
    if (parts[0].length <= 2) y += 2000
    m = Number(parts[1])
    d = Number(parts[2])
  }
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return 'invalid'
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return 'invalid'
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 금액 입력 표시용: '7800000.00' → '7,800,000' (소수 .00 은 버리고, 의미 있는 소수만 유지) */
export function formatAmountInput(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const s = String(raw).replace(/,/g, '')
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m) return String(raw)
  const [, sign, int, frac] = m
  const intFmt = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fracKeep = frac !== undefined && /[1-9]/.test(frac) ? `.${frac.replace(/0+$/, '')}` : s.endsWith('.') ? '.' : ''
  return `${sign}${intFmt}${fracKeep}`
}

/** 입력 문자열에서 숫자만 남긴 원시값 ('1,234,567' → '1234567') */
export function unformatAmountInput(text: string): string {
  const cleaned = text.replace(/[^\d.-]/g, '')
  const sign = cleaned.startsWith('-') ? '-' : ''
  const [int, ...rest] = cleaned.replace(/-/g, '').split('.')
  return sign + int + (rest.length ? '.' + rest.join('') : '')
}
