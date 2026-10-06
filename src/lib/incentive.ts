/** 거래별 인센티브 (2026-10-02 요청): 요율을 따로 정하지 않은 거래는 5%, 성과급 = 요율 × 손익 */
export const DEFAULT_INCENTIVE_RATE = 0.05

/** 저장값(0.05 = 5%) → 요율. 비어 있으면 기본 요율 */
export function incentiveRate(stored: string | number | null | undefined): number {
  if (stored === null || stored === undefined || stored === '') return DEFAULT_INCENTIVE_RATE
  const n = typeof stored === 'string' ? parseFloat(stored) : stored
  return Number.isFinite(n) ? n : DEFAULT_INCENTIVE_RATE
}

/** 요율 → 화면 표기 (0.05 → "5", 0.125 → "12.5") */
export function incentivePercentText(rate: number): string {
  return String(Math.round(rate * 10000) / 100)
}

export function incentiveAmount(profit: string | number | null | undefined, stored: string | number | null | undefined): number | null {
  if (profit === null || profit === undefined || profit === '') return null
  const p = typeof profit === 'string' ? parseFloat(profit) : profit
  if (!Number.isFinite(p)) return null
  // 요율은 소수 넷째 자리까지 저장되므로 만 배로 올려 곱한다 (부동소수점 오차 방지)
  return (p * Math.round(incentiveRate(stored) * 10000)) / 10000
}
