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

/**
 * 원화 손익 (2026-10-12 요청: 미국·중국법인은 손익 × 환율). 원화 거래는 손익 그대로, 환율이 없으면 null.
 * 성과급은 이 값 × 인센티브(%)
 */
export function profitKrw(profit: string | number | null | undefined, currency: string, fxRate: string | number | null | undefined): number | null {
  if (profit === null || profit === undefined || profit === '') return null
  const p = typeof profit === 'string' ? parseFloat(profit) : profit
  if (!Number.isFinite(p)) return null
  if (currency === 'KRW') return p
  const fx = typeof fxRate === 'string' ? parseFloat(fxRate) : fxRate
  if (fx == null || !Number.isFinite(fx) || fx <= 0) return null
  return Math.round(p * fx)
}

/** 추가 성과급 대상자 (2026-10-14) — 담당자 외에 같은 거래 성과급을 나눠 받는 사람 */
export type IncentiveShare = { userId: string; name: string; rate: string }

/** 담당자 몫 + 추가 대상자 몫. 기준 금액이 없으면 null */
export function incentiveTotal(base: string | number | null | undefined, stored: string | number | null | undefined, shares: IncentiveShare[] = []): number | null {
  const own = incentiveAmount(base, stored)
  if (own === null) return null
  return shares.reduce((a, s) => a + (incentiveAmount(base, s.rate) ?? 0), own)
}
