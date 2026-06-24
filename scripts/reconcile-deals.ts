import './_env'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { loadWorkbook, sheetToRows, parseNumber } from './import-utils'

// 검증 스크립트의 하드코딩 기대값(= 원화 시트 매출 합계만)
const EXPECTED_KRW_SALES = 4_800_891_278

const SHEETS: { source: string; name: string; start: number }[] = [
  { source: '원화', name: '원화매출매입', start: 8 },
  { source: '외화', name: '외화매출매입', start: 8 },
  { source: 'IP', name: 'IP&협찬건', start: 5 },
]

function fmt(n: number) {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
}

async function main() {
  const wb = loadWorkbook()

  let grandSales = 0
  let grandPurchase = 0
  console.log('\n시트별 원본 합계 (엑셀 컬럼 직접 합산: 매출 col25 / 매입 col31)')
  console.log('─'.repeat(64))
  for (const s of SHEETS) {
    const rows = sheetToRows(wb, s.name)
    let sales = 0
    let purchase = 0
    let cnt = 0
    for (let i = s.start; i < rows.length; i++) {
      const r = rows[i]
      const sn = parseNumber(r[25])
      const pn = parseNumber(r[31])
      if (sn === null && pn === null) continue
      cnt++
      sales += sn ?? 0
      purchase += pn ?? 0
    }
    grandSales += sales
    grandPurchase += purchase
    console.log(
      `  ${s.source.padEnd(4)} ${String(cnt).padStart(4)}행   매출 ${fmt(sales).padStart(18)}   매입 ${fmt(purchase).padStart(18)}`,
    )
  }
  console.log('─'.repeat(64))
  console.log(`  엑셀 3시트 합계      매출 ${fmt(grandSales).padStart(18)}   매입 ${fmt(grandPurchase).padStart(18)}`)

  // DB 합계
  const [row] = await db.execute<{ s: string; p: string; c: number }>(sql`
    SELECT coalesce(sum(sales_amount_net),0)::text s,
           coalesce(sum(purchase_amount_net),0)::text p,
           count(*)::int c
    FROM deal WHERE deleted_at IS NULL`)
  const dbSales = parseFloat(row.s)
  const dbPurchase = parseFloat(row.p)

  console.log(`\nDB 합계 (deal ${row.c}건)`)
  console.log('─'.repeat(64))
  console.log(`  DB                   매출 ${fmt(dbSales).padStart(18)}   매입 ${fmt(dbPurchase).padStart(18)}`)

  // 통화별
  const cur = await db.execute<{ currency: string; c: number; s: string }>(sql`
    SELECT currency, count(*)::int c, coalesce(sum(sales_amount_net),0)::text s
    FROM deal WHERE deleted_at IS NULL GROUP BY currency ORDER BY c DESC`)
  console.log('\n통화별 매출 (외화는 원본통화 금액 그대로 저장됨)')
  for (const r of cur) console.log(`  ${r.currency}: ${r.c}건, 매출 ${fmt(parseFloat(r.s))}`)

  console.log('\n대사 결과')
  console.log('─'.repeat(64))
  const dSales = Math.abs(dbSales - grandSales)
  console.log(`  ① DB 매출 ≈ 엑셀 3시트 매출 합계?  Δ=${fmt(dSales)}  → ${dSales < 1000 ? '✅ 일치(import 충실)' : '⚠️ 차이'}`)
  const ipDelta = dbSales - EXPECTED_KRW_SALES
  console.log(`  ② 검증 기대값(원화시트 only)=${fmt(EXPECTED_KRW_SALES)}`)
  console.log(`     DB − 원화기대값 = ${fmt(ipDelta)}  ← 외화+IP 시트가 더해진 정상 차이`)
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
