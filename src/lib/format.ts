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

/**
 * 아바타 이니셜 — 성만 쓰면 '이유정/이명철/이나린'이 전부 '이'로 겹쳐서 이름 2글자 사용
 * 한글 3자 → 이름(뒤 2자), 2자 → 그대로, 4자 이상(팀명 등) → 앞 2자, 라틴 → 단어 첫 글자 2개
 */
export function avatarInitials(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  if (!s) return '-'
  if (/^[가-힣]+$/.test(s)) {
    // 3자 인명은 이름 2자, 직함/팀명(관리자·영업팀 등)은 앞 2자
    if (s.length === 3 && !/[자팀부장당]$/.test(s)) return s.slice(1)
    return s.slice(0, 2)
  }
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}
