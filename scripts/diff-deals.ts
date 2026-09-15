import './_env'
import { isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal, users } from '@/lib/db/schema'
import { parseAllDeals } from './import-deals'

/**
 * 엑셀(XLSX_FILE) vs 현재 DB 거래 차이 — 병합 적재 전 검토용 (쓰기 없음)
 *   npx tsx scripts/diff-deals.ts
 */
const FIELDS = ['accrualYear','accrualMonth','ownerUserId','categoryId','accountId','currency','salesMethodId','issuerCounterpartyId','advertiserName','itemName','adStart','adEnd','salesAmountNet','salesVat','salesAmountGross','salesDueDate','salesPaidDate','salesPaidStatus','salesInvoiceDate','salesMemo','supplierCounterpartyId','settlementYear','settlementMonth','purchasePricingRaw','purchaseAmountNet','purchaseVat','purchaseAmountGross','purchaseDueDate','purchasePaidDate','purchasePaidStatus','purchaseInvoiceDate','purchaseMemo'] as const
const norm = (v: unknown) => (v == null || v === '' ? null : /^-?\d+(\.\d+)?$/.test(String(v)) ? String(Math.round(Number(v) * 100) / 100) : String(v))

async function main() {
  const { rows: xl, warnings } = await parseAllDeals()
  const dbRows = await db.select().from(deal).where(isNull(deal.deletedAt))
  const userNames = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]))
  const xlBy = new Map(xl.map((r) => [r.dealCode, r]))
  const dbBy = new Map(dbRows.map((r) => [r.dealCode, r]))

  const onlyXl = xl.filter((r) => !dbBy.has(r.dealCode))
  const onlyDb = dbRows.filter((r) => !xlBy.has(r.dealCode))
  const erpEdited = dbRows.filter((r) => r.updatedAt.getTime() - r.createdAt.getTime() > 120_000)
  let changed = 0
  const conflicts: string[] = []
  const changes: string[] = []
  for (const [code, x] of xlBy) {
    const d = dbBy.get(code)
    if (!d) continue
    const diff = FIELDS.filter((f) => norm((x as Record<string, unknown>)[f]) !== norm((d as Record<string, unknown>)[f]))
    if (diff.length === 0) continue
    changed++
    const line = `${code}: ${diff.map((f) => `${f} ${norm((d as Record<string, unknown>)[f]) ?? '-'}→${norm((x as Record<string, unknown>)[f]) ?? '-'}`).join(', ')}`
    if (erpEdited.some((e) => e.dealCode === code)) conflicts.push(line)
    else changes.push(line)
  }
  console.log(`엑셀 ${xl.length}건 / DB ${dbRows.length}건 (경고 ${warnings.length})`)
  console.log(`\n[엑셀에만 있음 → 추가 대상] ${onlyXl.length}건: ${onlyXl.map((r) => r.dealCode).join(' ')}`)
  console.log(`\n[DB에만 있음 → 유지(ERP 직접 등록)] ${onlyDb.length}건: ${onlyDb.map((r) => `${r.dealCode}(${userNames.get(r.ownerUserId ?? '') ?? '-'}, ${r.createdAt.toISOString().slice(0, 10)})`).join(' ')}`)
  console.log(`\n[양쪽에 있고 값이 다름] ${changed}건 — 그중 ERP에서 수정한 적 있는 건(충돌) ${conflicts.length}건`)
  for (const c of conflicts) console.log('  ⚠ ' + c.slice(0, 220))
  console.log(`\n[엑셀만 바뀐 건 → 엑셀값으로 갱신] ${changes.length}건 (앞 15건)`)
  for (const c of changes.slice(0, 15)) console.log('  ' + c.slice(0, 200))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
