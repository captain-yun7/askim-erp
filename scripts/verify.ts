import './_env'
import { sql } from 'drizzle-orm'
import { db } from '../src/lib/db/client'

/**
 * 엑셀 분석 결과 vs DB 합계·건수 비교
 * 기대치는 _docs/specs/05_migration_mapping.md §6 참조
 */
// 기준: 회계용_2026.09.01 엑셀 (2026-09-08 재적재)
const EXPECTED = {
  deal: {
    count: 888, // 원화 839 + 외화 12 + IP 37
    salesNet: 8_085_783_077.74,
    purchaseNet: 5_906_574_014.25,
    profit: 2_179_209_063.49,
  },
  expense: {
    count: 4002,
    amount: 1_722_117_831,
  },
  counterparty: {
    minCount: 770, // 304 마스터 + 자동생성 475 = 779
  },
  users: {
    minCount: 14, // 시드 15 + 고객 구성원 반영 후 운영 22
  },
}

async function main() {
  console.log('🔍 마이그레이션 검증\n')

  const tables: { name: string; count: number; extra?: string }[] = []

  // counterparty
  const [{ c: cpCount }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(sql`counterparty`)
  tables.push({
    name: 'counterparty',
    count: cpCount,
    extra: cpCount >= EXPECTED.counterparty.minCount ? '✓' : '✗ (적음)',
  })

  // users
  const [{ c: userCount }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(sql`users`)
  tables.push({
    name: 'users',
    count: userCount,
    extra: userCount >= EXPECTED.users.minCount ? '✓' : `✗ (기대 ${EXPECTED.users.minCount}+)`,
  })

  // lookups
  for (const t of ['deal_category', 'account', 'sales_method', 'expense_category']) {
    const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(sql.raw(t))
    tables.push({ name: t, count: c })
  }

  // deal — 카운트와 합계
  const [dealStat] = await db.execute<{
    cnt: number
    sales_sum: string
    purchase_sum: string
    profit_sum: string
  }>(sql`
    SELECT
      count(*)::int AS cnt,
      coalesce(sum(sales_amount_net), 0)::text AS sales_sum,
      coalesce(sum(purchase_amount_net), 0)::text AS purchase_sum,
      coalesce(sum(profit), 0)::text AS profit_sum
    FROM deal
  `)

  // expense — 카운트와 합계
  const [expStat] = await db.execute<{ cnt: number; total: string }>(sql`
    SELECT count(*)::int AS cnt, coalesce(sum(amount), 0)::text AS total
    FROM expense
  `)

  // 출력
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('테이블 건수')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const t of tables) {
    console.log(`  ${t.name.padEnd(20)} ${String(t.count).padStart(6)} ${t.extra ?? ''}`)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Deal 합계 (단위: KRW)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const dealRows = [
    ['건수', dealStat.cnt, EXPECTED.deal.count],
    ['매출 합계', parseFloat(dealStat.sales_sum), EXPECTED.deal.salesNet],
    ['매입 합계', parseFloat(dealStat.purchase_sum), EXPECTED.deal.purchaseNet],
    ['손익 합계', parseFloat(dealStat.profit_sum), EXPECTED.deal.profit],
  ] as const
  for (const [label, actual, expected] of dealRows) {
    const a = typeof actual === 'number' ? actual.toLocaleString() : actual
    const e = typeof expected === 'number' ? expected.toLocaleString() : expected
    const diff = typeof actual === 'number' && typeof expected === 'number' ? actual - expected : 0
    const mark = Math.abs(diff) < 1000 ? '✓' : `Δ ${diff.toLocaleString()}`
    console.log(`  ${label.padEnd(15)} actual=${a.padStart(16)}  expected=${e.padStart(16)}  ${mark}`)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Expense 합계 (단위: KRW)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const expRows = [
    ['건수', expStat.cnt, EXPECTED.expense.count],
    ['합계', parseFloat(expStat.total), EXPECTED.expense.amount],
  ] as const
  for (const [label, actual, expected] of expRows) {
    const a = typeof actual === 'number' ? actual.toLocaleString() : actual
    const e = typeof expected === 'number' ? expected.toLocaleString() : expected
    const diff = typeof actual === 'number' && typeof expected === 'number' ? actual - expected : 0
    const mark = Math.abs(diff) < 1000 ? '✓' : `Δ ${diff.toLocaleString()}`
    console.log(`  ${label.padEnd(15)} actual=${a.padStart(16)}  expected=${e.padStart(16)}  ${mark}`)
  }

  // 통화별 deal 분포
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Deal 통화별')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const currencies = await db.execute<{ currency: string; cnt: number }>(sql`
    SELECT currency, count(*)::int AS cnt FROM deal GROUP BY currency ORDER BY cnt DESC
  `)
  // postgres-js wraps result; .execute returns the rows for drizzle
  const currRows = Array.isArray(currencies) ? currencies : (currencies as { rows: typeof currencies[] }).rows ?? currencies
  for (const r of currRows as Array<{ currency: string; cnt: number }>) {
    console.log(`  ${r.currency}: ${r.cnt}건`)
  }

  // 카테고리별
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Deal 카테고리별 TOP 5')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const cats = await db.execute<{ name_ko: string; cnt: number }>(sql`
    SELECT c.name_ko, count(*)::int AS cnt
    FROM deal d JOIN deal_category c ON c.id = d.category_id
    GROUP BY c.name_ko ORDER BY cnt DESC LIMIT 5
  `)
  const catRows = Array.isArray(cats) ? cats : (cats as any).rows ?? cats
  for (const r of catRows as Array<{ name_ko: string; cnt: number }>) {
    console.log(`  ${r.name_ko.padEnd(20)} ${r.cnt}건`)
  }

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
