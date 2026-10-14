import './_env'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal, dealIncentiveShare } from '@/lib/db/schema'
import { ENTITY } from './import-utils'
import { parseAllDeals } from './import-deals'

/**
 * 성과급 바로잡기 (2026-10-14 고객 요청) — 엑셀 한 파일을 읽어
 *  1) 금액 없이 성과급만 있던 행 → 그 거래의 추가 성과급 대상자(deal_incentive_share)로 넣는다
 *  2) RATE_YEARS 귀속연도 거래 중 ERP 요율이 비어 있는(=기본 5%) 거래에 엑셀 성과급(%)을 넣는다. ERP 에서 고친 요율은 건드리지 않는다
 *  3) 성과급 행이 먼저 나와 거래로 잘못 들어간 경우(AZ260318 = 금액 없음, 진짜는 AZ260318-2) → 빈 거래를 지우고 진짜에 원래 코드를 돌려준다
 * 멱등. DRY_RUN=1 이면 보고만.
 *   DRY_RUN=1 XLSX_FILE=... RATE_YEARS=2025 npx tsx scripts/fix-incentive-1014.ts
 */
const DRY = process.env.DRY_RUN === '1'
const RATE_YEARS = (process.env.RATE_YEARS ?? '').split(',').map((s) => parseInt(s, 10)).filter(Number.isFinite)
const num = (v: string | null | undefined) => (v == null ? null : parseFloat(v))

async function main() {
  const { rows: xl, shares } = await parseAllDeals()
  const dbRows = await db.select().from(deal).where(and(eq(deal.entity, ENTITY), isNull(deal.deletedAt)))
  const byCode = new Map(dbRows.map((d) => [d.dealCode, d]))
  console.log(`${DRY ? '🔍 DRY RUN' : '✍️  FIX'} — ${process.env.XLSX_FILE}`)

  // 3) 성과급 행이 거래로 들어간 것
  const xlCodes = new Set(xl.map((r) => r.dealCode))
  const renames: { bogusId: string; realId: string; code: string }[] = []
  for (const code of new Set(shares.map((s) => s.dealCode))) {
    const bogus = byCode.get(code)
    const real = byCode.get(`${code}-2`)
    if (!bogus || !real || xlCodes.has(`${code}-2`)) continue
    if (bogus.salesAmountNet != null || bogus.purchaseAmountNet != null) continue
    if (bogus.updatedAt.getTime() - bogus.createdAt.getTime() > 120_000) {
      console.log(`  ⚠ ${code}: 금액 없는 거래가 ERP 에서 수정된 적이 있어 건너뜀`)
      continue
    }
    renames.push({ bogusId: bogus.id, realId: real.id, code })
    console.log(`  [잘못 들어간 성과급 행] ${code}(금액 없음) 삭제, ${code}-2 → ${code}`)
  }

  // 1) 추가 성과급 대상자
  const target = (code: string) => {
    const r = renames.find((x) => x.code === code)
    return r ? dbRows.find((d) => d.id === r.realId) : byCode.get(code)
  }
  const inserts: { dealId: string; userId: string; rate: string; sortOrder: number }[] = []
  const order = new Map<string, number>()
  for (const s of shares) {
    const d = target(s.dealCode)
    const tag = `R${s.rowNum} ${s.dealCode} ${s.ownerName ?? '?'} ${s.rate != null ? `${Math.round(s.rate * 10000) / 100}%` : '-'}`
    if (!d) { console.log(`  ⚠ ${tag}: ERP 에 거래가 없음`); continue }
    if (!s.userId) { console.log(`  ⚠ ${tag}: 사용자 없음`); continue }
    if (s.rate == null) { console.log(`  ⚠ ${tag}: 요율 없음`); continue }
    if (s.userId === d.ownerUserId) { console.log(`  ⚠ ${tag}: 거래 담당자와 같은 사람`); continue }
    const expect = (num(d.profit) ?? 0) * s.rate
    // 엑셀 성과급이 0 인데 계산하면 0 이 아닌 행은 요율만 복사돼 있던 빈 행 — 실제로 나눠 받은 게 아니다
    if (!s.amount && Math.abs(expect) > 1) { console.log(`  · ${tag}: 엑셀 성과급 0 — 추가 대상자 아님`); continue }
    const note = s.amount != null && Math.abs(expect - s.amount) > 1 ? ` ⚠ 엑셀 성과급 ${s.amount} ≠ 손익×요율 ${Math.round(expect)}` : ''
    console.log(`  [추가 대상자] ${tag} → ${Math.round(expect).toLocaleString()}원${note}`)
    const n = order.get(d.id) ?? 0
    order.set(d.id, n + 1)
    inserts.push({ dealId: d.id, userId: s.userId, rate: s.rate.toFixed(4), sortOrder: n })
  }

  // 2) 요율
  const rateSets: { id: string; pct: string }[] = []
  const kept: string[] = []
  if (RATE_YEARS.length) {
    for (const x of xl) {
      if (!RATE_YEARS.includes(x.accrualYear) || x.commissionPct == null) continue
      const d = byCode.get(x.dealCode)
      if (!d) continue
      if (d.commissionPct == null) rateSets.push({ id: d.id, pct: x.commissionPct })
      else if (num(d.commissionPct) !== num(x.commissionPct)) kept.push(`${d.dealCode} ERP ${d.commissionPct} (엑셀 ${x.commissionPct})`)
    }
    const dist = new Map<string, number>()
    for (const r of rateSets) dist.set(r.pct, (dist.get(r.pct) ?? 0) + 1)
    console.log(`  [요율] ${RATE_YEARS.join(',')} 귀속 ${rateSets.length}건 채움: ${[...dist].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${Math.round(parseFloat(p) * 10000) / 100}%×${n}`).join(' ')}`)
    if (kept.length) console.log(`  [요율] ERP 에서 고친 값 유지 ${kept.length}건: ${kept.join(', ')}`)
  }
  console.log(`  합계 — 추가 대상자 ${inserts.length}건, 요율 ${rateSets.length}건, 잘못 들어간 행 ${renames.length}건`)
  if (DRY) return

  await db.transaction(async (tx) => {
    for (const r of renames) {
      await tx.delete(deal).where(eq(deal.id, r.bogusId))
      await tx.update(deal).set({ dealCode: r.code }).where(eq(deal.id, r.realId))
    }
    if (inserts.length) await tx.insert(dealIncentiveShare).values(inserts).onConflictDoNothing()
    const byPct = new Map<string, string[]>()
    for (const r of rateSets) (byPct.get(r.pct) ?? byPct.set(r.pct, []).get(r.pct)!).push(r.id)
    // updated_at 은 그대로 — 적재 보정이라 "최근 수정" 표시가 뜨지 않게
    for (const [pct, ids] of byPct) await tx.update(deal).set({ commissionPct: pct, updatedAt: sql`${deal.updatedAt}` }).where(and(inArray(deal.id, ids), isNull(deal.commissionPct)))
  })
  console.log('  ✓ 완료')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
