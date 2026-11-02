import type { MediaPriceType } from '@/lib/db/schema/media'

/** 엑셀 칸 이름 그대로 */
export const PRICE_TYPE_LABEL: Record<MediaPriceType, string> = {
  sale: '판매가(Gross)',
  net: '입금가(Net)',
  landlord: '건물주 매입가',
  prod_sale: '제작 판매가',
  prod_net: '제작 입금가',
}

export const MEDIA_STATUSES = ['운영 중', '검토 중', '중단', '계약 종료']

export const OPTION_KIND_LABEL = {
  category: '구분',
  region: '지역',
  contract_type: '계약종류',
  vendor: '시공사',
  status: '관리 상태',
} as const

/** 금액은 만원 단위로 보여 준다 (엑셀이 만원 단위) — 만원으로 안 나눠지면 원 */
export function formatMan(won: number | string | null | undefined): string {
  if (won == null || won === '') return '-'
  const n = Number(won)
  if (!Number.isFinite(n)) return '-'
  if (n % 10_000 === 0) return `${(n / 10_000).toLocaleString('ko-KR')}만원`
  return `${n.toLocaleString('ko-KR')}원`
}

/** 끝나는 날이 지나면 '만료' (PDF: 자동으로 만료 표시) */
export function contractExpired(end: string | null | undefined, today = new Date()): boolean {
  if (!end) return false
  const t = today.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  return end < t
}

export function regionText(m: { regionCity: string | null; regionDistrict: string | null; regionArea: string | null }): string {
  return [m.regionCity, m.regionDistrict, m.regionArea].filter(Boolean).join(' › ')
}
