import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/server/auth/guards'

/**
 * 당일 환율 조회 (기준통화 → KRW)
 * open.er-api.com — 무료/키 불필요, 일 1회 갱신. 실패 시 클라이언트가 수기 입력 유지.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const base = (req.nextUrl.searchParams.get('base') ?? 'USD').toUpperCase()
  if (!/^[A-Z]{3}$/.test(base)) return NextResponse.json({ error: 'bad base' }, { status: 400 })

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      next: { revalidate: 3600 },
    })
    const data = await res.json()
    const rate = data?.rates?.KRW
    if (typeof rate !== 'number') throw new Error('no KRW rate')
    return NextResponse.json({
      base,
      krw: Math.round(rate * 100) / 100,
      updatedAt: data.time_last_update_utc ?? null,
    })
  } catch {
    return NextResponse.json({ error: '환율 조회 실패' }, { status: 502 })
  }
}
