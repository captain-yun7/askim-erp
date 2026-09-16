import './_env'
import { eq, sql } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db/client'
import { deposit, exclusiveContract } from '@/lib/db/schema'
import { cleanText, parseDate } from './import-utils'

/**
 * 보증금·전속계약 날짜 하루 밀림 복구 (2026-09-16, SheetJS cellDates 버그).
 * 적재 순서(display_order) + 이름으로 엑셀 행과 짝을 맞추고, DB 날짜가 엑셀 날짜의 전날이면 엑셀 날짜로 고친다. 그 외(ERP 에서 수정한 값)는 건드리지 않음.
 *   DRY_RUN=1 npx tsx scripts/repair-deposit-dates.ts
 */
const DRY = process.env.DRY_RUN === '1'
const FILE = process.env.DEPOSIT_XLSX ?? '_docs/specs/feedback/20260825/[Askim] 영업관련 보증금 관리 시트.xlsx'
const nextDay = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10) }
const fix = (dbVal: string | null, xl: string | null) => (dbVal && xl && nextDay(dbVal) === xl ? xl : null)

async function main() {
  const wb = XLSX.readFile(FILE, { cellDates: false })
  let n = 0, skipped = 0
  const dep = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['보증금현황'], { header: 1, defval: '' })
  const dbDep = await db.select().from(deposit)
  let order = 0
  for (let i = 3; i < dep.length; i++) {
    const r = dep[i]; const name = cleanText(r[1]); if (!name) continue
    order++
    const d = dbDep.find((x) => x.displayOrder === order && x.counterpartyName === name)
    if (!d) { skipped++; console.log('  짝 없음(보증금):', order, name); continue }
    const set: Record<string, string> = {}
    const p = fix(d.paidDate, parseDate(r[5])); if (p) set.paidDate = p
    const q = fix(d.returnedDate, parseDate(r[6])); if (q) set.returnedDate = q
    if (!Object.keys(set).length) continue
    n++; console.log('  보증금', name, d.paidDate, '→', set.paidDate ?? '=', '|', d.returnedDate, '→', set.returnedDate ?? '=')
    if (!DRY) await db.update(deposit).set({ ...set, updatedAt: sql`updated_at` }).where(eq(deposit.id, d.id))
  }
  const con = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['전속매체 계약사항'], { header: 1, defval: '' })
  const dbCon = await db.select().from(exclusiveContract)
  order = 0
  for (let i = 3; i < con.length; i++) {
    const r = con[i]; const name = cleanText(r[1]); if (!name) continue
    order++
    const d = dbCon.find((x) => x.displayOrder === order && x.mediaName === name)
    if (!d) { skipped++; console.log('  짝 없음(계약):', order, name); continue }
    const set: Record<string, string> = {}
    const p = fix(d.depositPaidDate, parseDate(r[7])); if (p) set.depositPaidDate = p
    const q = fix(d.depositReturnedDate, parseDate(r[8])); if (q) set.depositReturnedDate = q
    if (!Object.keys(set).length) continue
    n++; console.log('  계약', name, d.depositPaidDate, '→', set.depositPaidDate ?? '=', '|', d.depositReturnedDate, '→', set.depositReturnedDate ?? '=')
    if (!DRY) await db.update(exclusiveContract).set({ ...set, updatedAt: sql`updated_at` }).where(eq(exclusiveContract.id, d.id))
  }
  console.log(`${DRY ? 'DRY' : '✓'} 보정 ${n}건, 짝 없음 ${skipped}건`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
