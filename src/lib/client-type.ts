/**
 * 거래처 구분 (2026-09-28 매출분석보고서 요청) — 매출 거래처를 산업군으로 묶는 기준.
 * 고객 예시 표의 5가지 + 기타. DB 에는 코드(text)로 저장한다.
 */
export const CLIENT_TYPES = [
  { value: 'direct', label: '직거래' },
  { value: 'agency', label: '대행사' },
  { value: 'china', label: '중국사업부' },
  { value: 'fanclub', label: '팬클럽' },
  { value: 'public', label: '공공기관' },
  { value: 'etc', label: '기타' },
] as const

export type ClientType = (typeof CLIENT_TYPES)[number]['value']

export const CLIENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(CLIENT_TYPES.map((t) => [t.value, t.label]))
export const UNSET_CLIENT_TYPE_LABEL = '미지정'

export const isClientType = (v: unknown): v is ClientType => typeof v === 'string' && CLIENT_TYPES.some((t) => t.value === v)
export const clientTypeLabel = (v: string | null | undefined) => (v ? (CLIENT_TYPE_LABEL[v] ?? v) : UNSET_CLIENT_TYPE_LABEL)
