import './_env'
import { eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { expense } from '@/lib/db/schema'
import { parseAllExpenses } from './import-expenses'

/**
 * 판관비 지출일 하루 밀림 복구 (2026-09-16) — SheetJS cellDates 버그로 날짜형 셀만 전날로 적재됨.
 * 엑셀(XLSX_FILE, 수정된 파서)과 DB 행을 (금액·품목·거래처·분류) 키로 묶고, DB 날짜가 엑셀 날짜 또는 그 전날이면 엑셀 날짜로 맞춘다.
 *   DRY_RUN=1 XLSX_FILE=... npx tsx scripts/repair-expense-dates.ts
 */
const DRY = process.env.DRY_RUN === '1'
const key = (r: { amount: string | number; itemName?: string | null; counterpartyText?: string | null; expenseCategoryId?: number | null }) =>
  `${Math.round(Number(r.amount))}|${r.itemName ?? ''}|${r.counterpartyText ?? ''}|${r.expenseCategoryId ?? ''}`
const prevDay = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10) }

async function main() {
  const { corporate, personal } = await parseAllExpenses()
  const xl = [...corporate, ...personal]
  const dbRows = await db.select().from(expense).where(isNull(expense.deletedAt))
  const xlBy = new Map<string, { expenseDate: string }[]>()
  for (const r of xl) { const k = key(r); (xlBy.get(k) ?? xlBy.set(k, []).get(k)!).push(r) }
  const fixes: { id: string; from: string; to: string }[] = []
  const unmatchedDb: typeof dbRows = []
  for (const d of dbRows) {
    const cands = xlBy.get(key(d)) ?? []
    // 정확히 같은 날짜 우선, 없으면 DB 날짜 +1 이 엑셀 날짜인 것
    let idx = cands.findIndex((c) => c.expenseDate === d.expenseDate)
    if (idx < 0) idx = cands.findIndex((c) => c.expenseDate === prevDay(d.expenseDate))
    if (idx < 0) { unmatchedDb.push(d); continue }
    const [c] = cands.splice(idx, 1)
    if (c.expenseDate !== d.expenseDate) fixes.push({ id: d.id, from: d.expenseDate, to: c.expenseDate })
  }
  const leftover = [...xlBy.values()].flat()
  console.log(`DB ${dbRows.length} / 엑셀 ${xl.length} → 날짜 보정 ${fixes.length}건, DB 만 있음 ${unmatchedDb.length}건, 엑셀만 있음 ${leftover.length}건`)
  for (const u of unmatchedDb) console.log('  DB만:', u.expenseDate, u.itemName, u.amount, u.counterpartyText)
  for (const l of leftover.slice(0, 10)) console.log('  엑셀만:', JSON.stringify(l).slice(0, 120))
  const byMonth = new Map<string, number>()
  for (const f of fixes) byMonth.set(`${f.from.slice(0, 7)}→${f.to.slice(0, 7)}`, (byMonth.get(`${f.from.slice(0, 7)}→${f.to.slice(0, 7)}`) ?? 0) + 1)
  console.log('  월 이동:', [...byMonth].filter(([k]) => k.slice(0, 7) !== k.slice(8)).map(([k, n]) => `${k}:${n}`).join(' '))
  if (DRY) { process.exit(0) }
  for (const f of fixes) await db.update(expense).set({ expenseDate: f.to, updatedAt: sql`updated_at` }).where(eq(expense.id, f.id))
  console.log(`✓ ${fixes.length}건 보정`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
