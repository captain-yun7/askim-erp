/**
 * 원화 환율 자동 조회 (2026-10-12 요청: 미국·중국법인 환율은 매출 입금일 기준으로 자동).
 * 기준: 은행 매매기준율 (2026-10-13 고객 확정) — 한국은행 ECOS 731Y001 "주요국 통화의 대원화환율(매매기준율)".
 * 주말·휴일·당일 고시 전에는 직전 영업일 값을 쓴다.
 * 조회 실패 시 null — 저장은 막지 않고 환율 칸만 비워 둔다(손으로 넣을 수 있음).
 */
const ECOS_ITEM: Record<string, string> = { USD: '0000001', CNY: '0000053' }
const LOOKBACK_DAYS = 10

const cache = new Map<string, number>()

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '')

export async function fetchKrwRate(currency: string, date: string): Promise<number | null> {
  const item = ECOS_ITEM[currency]
  if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const key = `${currency}:${date}`
  const hit = cache.get(key)
  if (hit) return hit
  const end = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(end.getTime())) return null
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 86400_000)
  // 키가 없으면 ECOS 공개 시험키(sample, 10건 제한)로 조회 — 운영은 ECOS_API_KEY 를 넣는다
  const apiKey = encodeURIComponent(process.env.ECOS_API_KEY || 'sample')
  try {
    const res = await fetch(
      `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/10/731Y001/D/${ymd(start)}/${ymd(end)}/${item}`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { StatisticSearch?: { row?: { TIME: string; DATA_VALUE: string }[] } }
    const rows = body.StatisticSearch?.row ?? []
    const last = rows.filter((r) => r.TIME <= ymd(end)).sort((a, b) => a.TIME.localeCompare(b.TIME)).at(-1)
    const rate = last ? parseFloat(last.DATA_VALUE) : NaN
    if (!Number.isFinite(rate) || rate <= 0) return null
    // 당일 고시 전에는 직전 영업일 값이 오므로, 오늘 이후 날짜는 그날 값이 나왔을 때만 캐시한다
    const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
    if (date < todayKst || last!.TIME === ymd(end)) cache.set(key, rate)
    return rate
  } catch {
    return null
  }
}
