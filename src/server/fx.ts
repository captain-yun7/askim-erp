/**
 * 원화 환율 자동 조회 (2026-10-12 요청: 미국·중국법인 환율은 매출 입금일 기준으로 자동).
 * 출처: Frankfurter(유럽중앙은행 기준환율, 키 불필요). 주말·휴일은 직전 영업일 값이 온다.
 * 조회 실패 시 null — 저장은 막지 않고 환율 칸만 비워 둔다(손으로 넣을 수 있음).
 */
const cache = new Map<string, number>()

export async function fetchKrwRate(currency: string, date: string): Promise<number | null> {
  if (currency === 'KRW' || !/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const key = `${currency}:${date}`
  const hit = cache.get(key)
  if (hit) return hit
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${date}?base=${currency}&symbols=KRW`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { rates?: { KRW?: number } }
    const rate = body.rates?.KRW
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null
    cache.set(key, rate)
    return rate
  } catch {
    return null
  }
}
