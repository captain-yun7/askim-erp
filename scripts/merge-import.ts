import './_env'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty, deal, dealFieldChange, expense } from '@/lib/db/schema'
import { dupKey } from '@/lib/expense-upload'
import { counterpartyKey, loadWorkbook, sheetToRows } from './import-utils'
import { parseMaster, autoCreateFromDeals } from './import-counterparties'
import { parseAllDeals } from './import-deals'
import { parseAllExpenses } from './import-expenses'

/**
 * 병합 적재 — 엑셀(XLSX_FILE)을 현재 DB 위에 덮어쓰지 않고 합친다 (2026-09-15~, 베타 이후 표준)
 *   - 거래처: 거래처관리 시트·거래시트에서 미등록 상호만 추가, 보증금 재연결
 *   - 거래: 거래코드 기준 upsert. ERP 직접 등록분(엑셀에 없음)·삭제분은 보존.
 *            ERP 에서 수정한 적 있는 행(updated_at > created_at+2분)은 엑셀값과 다르면 충돌로 보고 건너뜀
 *            CONFLICT=xl 이면 엑셀 우선, CONFLICT=safe 면 ERP 에서 손댄 필드(deal_field_change)만 남기고 나머지 필드는 엑셀값 적용
 *   - 판관비: dupKey(일자|금액|품목|거래처) 기준 미존재 행만 추가. DB 에만 있는 행 보존
 *   DRY_RUN=1 이면 쓰기 없음.
 *     DRY_RUN=1 XLSX_FILE=... npx tsx scripts/merge-import.ts
 */
const DRY = process.env.DRY_RUN === '1'
const CONFLICT_XL = process.env.CONFLICT === 'xl'
const CONFLICT_SAFE = process.env.CONFLICT === 'safe'

const FIELDS = ['accrualYear','accrualMonth','ownerUserId','categoryId','accountId','currency','salesMethodId','issuerCounterpartyId','advertiserName','itemName','adStart','adEnd','salesAmountNet','salesVat','salesAmountGross','salesDueDate','salesPaidDate','salesPaidStatus','salesInvoiceDate','salesMemo','supplierCounterpartyId','settlementYear','settlementMonth','purchasePricingRaw','purchaseAmountNet','purchaseVat','purchaseAmountGross','purchaseDueDate','purchasePaidDate','purchasePaidStatus','purchaseInvoiceDate','purchaseMemo'] as const
const norm = (v: unknown) => (v == null || v === '' ? null : /^-?\d+(\.\d+)?$/.test(String(v)) ? String(Math.round(Number(v) * 100) / 100) : String(v))
type Rec = Record<string, unknown>

async function mergeCounterparties() {
  const wb = loadWorkbook()
  const existing = await db.select({ name: counterparty.name }).from(counterparty)
  const keys = new Set(existing.map((c) => counterpartyKey(c.name)))
  const names = new Set(existing.map((c) => c.name))
  const fresh = parseMaster(sheetToRows(wb, '거래처관리')).filter((r) => !names.has(r.name) && !keys.has(counterpartyKey(r.name)))
  console.log(`[거래처] 거래처관리 신규 ${fresh.length}건: ${fresh.map((r) => r.name).join(', ') || '-'}`)
  if (!DRY && fresh.length) await db.insert(counterparty).values(fresh)
  if (!DRY) {
    const auto = await autoCreateFromDeals(wb)
    console.log(`[거래처] 거래시트 자동 생성 ${auto}건`)
    await db.execute(sql`UPDATE deposit d SET counterparty_id = c.id FROM counterparty c WHERE d.counterparty_id IS NULL AND d.counterparty_name = c.name`)
  }
}

async function mergeDeals() {
  const { rows: xl, warnings } = await parseAllDeals()
  const dbRows = await db.select().from(deal)
  const dbBy = new Map(dbRows.map((r) => [r.dealCode, r]))
  const touched = new Map<string, Set<string>>() // dealId → ERP 에서 수정한 필드
  for (const c of await db.select({ dealId: dealFieldChange.dealId, field: dealFieldChange.field }).from(dealFieldChange)) (touched.get(c.dealId) ?? touched.set(c.dealId, new Set()).get(c.dealId)!).add(c.field)
  const toInsert = xl.filter((r) => !dbBy.has(r.dealCode))
  let updated = 0
  const conflicts: string[] = []
  const updates: { id: string; set: Rec; line: string }[] = []
  for (const x of xl) {
    const d = dbBy.get(x.dealCode)
    if (!d) continue
    if (d.deletedAt) continue // ERP 에서 삭제한 거래는 되살리지 않음
    let diff = FIELDS.filter((f) => norm((x as Rec)[f]) !== norm((d as Rec)[f]))
    if (!diff.length) continue
    const erpEdited = d.updatedAt.getTime() - d.createdAt.getTime() > 120_000
    if (erpEdited && CONFLICT_SAFE) {
      const keep = diff.filter((f) => touched.get(d.id)?.has(f))
      if (keep.length) conflicts.push(`${x.dealCode}: ERP 값 유지 → ${keep.map((f) => `${f} ${norm((d as Rec)[f]) ?? '-'} (엑셀 ${norm((x as Rec)[f]) ?? '-'})`).join(', ')}`)
      diff = diff.filter((f) => !touched.get(d.id)?.has(f))
      if (!diff.length) continue
    }
    const line = `${x.dealCode}: ${diff.map((f) => `${f} ${norm((d as Rec)[f]) ?? '-'}→${norm((x as Rec)[f]) ?? '-'}`).join(', ')}`
    if (erpEdited && !CONFLICT_XL && !CONFLICT_SAFE) { conflicts.push(line); continue }
    const set: Rec = Object.fromEntries(diff.map((f) => [f, (x as Rec)[f] ?? null]))
    set.updatedAt = d.updatedAt // 적재는 사용자 수정이 아니므로 갱신시각·하이라이트 유지 안 함
    updates.push({ id: d.id, set, line })
  }
  console.log(`\n[거래] 엑셀 ${xl.length} / DB ${dbRows.length} (파싱 경고 ${warnings.length})`)
  console.log(`  추가 ${toInsert.length}건: ${toInsert.map((r) => r.dealCode).join(' ')}`)
  console.log(`  갱신 ${updates.length}건`)
  for (const u of updates.slice(0, 5)) console.log('    ' + u.line.slice(0, 160))
  console.log(`  충돌(ERP 수정분, 건너뜀) ${conflicts.length}건`)
  for (const c of conflicts) console.log('    ⚠ ' + c.slice(0, 200))
  const onlyDb = dbRows.filter((r) => !xl.some((x) => x.dealCode === r.dealCode))
  console.log(`  DB 에만 있어 보존 ${onlyDb.length}건: ${onlyDb.map((r) => r.dealCode).join(' ')}`)
  if (DRY) return
  for (let i = 0; i < toInsert.length; i += 200) await db.insert(deal).values(toInsert.slice(i, i + 200))
  for (const u of updates) {
    await db.update(deal).set(u.set).where(eq(deal.id, u.id))
    updated++
  }
  console.log(`  ✓ 추가 ${toInsert.length} / 갱신 ${updated}`)
}

async function mergeExpenses() {
  const { corporate, personal } = await parseAllExpenses()
  const all = [...corporate, ...personal].map((r) => ({ ...r, itemName: r.itemName ?? null, counterpartyText: r.counterpartyText ?? null }))
  const dbRows = await db.select({ expenseDate: expense.expenseDate, amount: expense.amount, itemName: expense.itemName, counterpartyText: expense.counterpartyText }).from(expense)
  // 동일 키(같은 날 같은 금액·품목·거래처)가 정당하게 여러 건일 수 있으므로 개수 기준(multiset) 차이만 추가
  const have = new Map<string, number>()
  for (const r of dbRows) have.set(dupKey(r), (have.get(dupKey(r)) ?? 0) + 1)
  const fresh = all.filter((r) => {
    const k = dupKey(r)
    const n = have.get(k) ?? 0
    if (n > 0) { have.set(k, n - 1); return false }
    return true
  })
  const byMonth = new Map<string, number>()
  for (const r of fresh) byMonth.set(r.expenseDate.slice(0, 7), (byMonth.get(r.expenseDate.slice(0, 7)) ?? 0) + 1)
  console.log(`\n[판관비] 엑셀 ${all.length} / DB ${dbRows.length} → 추가 ${fresh.length}건 (${[...byMonth].map(([m, n]) => `${m}:${n}`).join(' ')})`)
  if (DRY || !fresh.length) return
  for (let i = 0; i < fresh.length; i += 500) await db.insert(expense).values(fresh.slice(i, i + 500))
  console.log(`  ✓ 추가 ${fresh.length}`)
}

async function main() {
  console.log(`${DRY ? '🔍 DRY RUN' : '✍️  MERGE'} — ${process.env.XLSX_FILE}`)
  await mergeCounterparties()
  await mergeDeals()
  await mergeExpenses()
  const [d] = await db.select({ c: sql<number>`count(*)::int` }).from(deal).where(isNull(deal.deletedAt))
  const [e] = await db.select({ c: sql<number>`count(*)::int` }).from(expense).where(isNull(expense.deletedAt))
  const [c] = await db.select({ c: sql<number>`count(*)::int` }).from(counterparty)
  console.log(`\n📊 거래 ${d.c} / 판관비 ${e.c} / 거래처 ${c.c}`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
