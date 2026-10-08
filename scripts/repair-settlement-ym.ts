import './_env'
import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal } from '@/lib/db/schema'

/**
 * 결산연월 정비 (2026-10-08) — 결산예정일 입력을 없애고 결산연월만 쓰기로 하면서
 *   1) 결산연도가 '26' 처럼 두 자리로 저장된 거래 → 2000년대로
 *   2) 결산연월은 없고 결산예정일만 있는 거래 → 결산예정일의 연·월을 결산연월로
 *   DRY_RUN=1 npx tsx scripts/repair-settlement-ym.ts
 */
async function main() {
  const dry = process.env.DRY_RUN === '1'
  const twoDigit = await db.select({ id: deal.id, code: deal.dealCode, y: deal.settlementYear, m: deal.settlementMonth }).from(deal).where(and(isNull(deal.deletedAt), isNotNull(deal.settlementYear), lt(deal.settlementYear, 100)))
  for (const r of twoDigit) {
    console.log(`  연도 보정 ${r.code}: ${r.y}-${r.m} → ${2000 + r.y!}-${r.m}`)
    if (!dry) await db.update(deal).set({ settlementYear: 2000 + r.y! }).where(eq(deal.id, r.id))
  }
  const dueOnly = await db.select({ id: deal.id, code: deal.dealCode, due: deal.purchaseDueDate }).from(deal).where(and(isNull(deal.deletedAt), isNotNull(deal.purchaseDueDate), or(isNull(deal.settlementYear), isNull(deal.settlementMonth))))
  for (const r of dueOnly) {
    const [y, m] = r.due!.split('-').map(Number)
    console.log(`  결산연월 채움 ${r.code}: 결산예정일 ${r.due} → ${y}-${m}`)
    if (!dry) await db.update(deal).set({ settlementYear: y, settlementMonth: m }).where(eq(deal.id, r.id))
  }
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(deal).where(and(isNull(deal.deletedAt), or(lt(deal.settlementYear, 100), and(isNotNull(deal.purchaseDueDate), isNull(deal.settlementYear)))))
  console.log(`${dry ? '[미리보기] ' : '✓ '}연도 보정 ${twoDigit.length}건, 결산연월 채움 ${dueOnly.length}건${dry ? '' : ` · 남은 문제 ${left.n}건`}`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
