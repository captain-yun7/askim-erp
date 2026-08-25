import './_env'
import { sql } from 'drizzle-orm'
import { db } from '../src/lib/db/client'
import { counterparty, deposit, exclusiveContract, users } from '../src/lib/db/schema'
import { cleanText, counterpartyKey, parseDate } from './import-utils'
import * as XLSX from 'xlsx'

const FILE =
  process.env.DEPOSIT_XLSX ??
  '_docs/specs/feedback/20260825/[Askim] 영업관련 보증금 관리 시트.xlsx'

/** 반환일 컬럼: 날짜 / '미반환' / '다음 광고에서 상계' / 빈값 혼재 */
function parseReturn(v: unknown): { date: string | null; status: 'held' | 'returned' | 'offset' | 'unreturned' } {
  const d = parseDate(v)
  if (d) return { date: d, status: 'returned' }
  const s = cleanText(v)
  if (!s) return { date: null, status: 'held' }
  if (s.includes('상계')) return { date: null, status: 'offset' }
  if (s.includes('미반환')) return { date: null, status: 'unreturned' }
  return { date: null, status: 'held' }
}

async function main() {
  const wb = XLSX.readFile(FILE, { cellDates: true })
  const us = await db.select({ id: users.id, name: users.name }).from(users)
  const userByName = new Map(us.map((u) => [u.name, u.id]))
  const cps = await db.select({ id: counterparty.id, name: counterparty.name }).from(counterparty)
  const cpByKey = new Map(cps.map((c) => [counterpartyKey(c.name), c.id]))

  const owner = (raw: unknown) => {
    const name = cleanText(raw)
    if (!name) return { ownerName: null, ownerUserId: null }
    // '이명철(중사부)' → 이명철
    const base = name.replace(/\(.*\)$/, '').trim()
    return { ownerName: name, ownerUserId: userByName.get(base) ?? null }
  }

  await db.execute(sql`TRUNCATE TABLE deposit, exclusive_contract`)

  // 보증금현황 — 헤더 R3, 데이터 R4~
  const dep = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['보증금현황'], { header: 1, defval: '' })
  const depRows: (typeof deposit.$inferInsert)[] = []
  for (let i = 3; i < dep.length; i++) {
    const r = dep[i]
    const name = cleanText(r[1])
    if (!name) continue
    const ret = parseReturn(r[6])
    depRows.push({
      counterpartyName: name,
      counterpartyId: cpByKey.get(counterpartyKey(name)) ?? null,
      description: cleanText(r[2]),
      ...owner(r[3]),
      amount: String(Number(r[4]) || 0),
      paidDate: parseDate(r[5]),
      returnedDate: ret.date,
      status: ret.status,
      memo: cleanText(r[7]),
      displayOrder: depRows.length + 1,
    })
  }
  if (depRows.length) await db.insert(deposit).values(depRows)

  // 전속매체 계약사항 — 헤더 R3, 데이터 R4~ (col0 비고 열이 A에 없음: B부터)
  const con = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['전속매체 계약사항'], { header: 1, defval: '' })
  const conRows: (typeof exclusiveContract.$inferInsert)[] = []
  for (let i = 3; i < con.length; i++) {
    const r = con[i]
    const name = cleanText(r[1])
    if (!name) continue
    const fee = (cleanText(r[6]) ?? '').toUpperCase()
    conRows.push({
      mediaName: name,
      mediaType: cleanText(r[2]),
      ...owner(r[3]),
      contractPeriod: cleanText(r[4]),
      contractTerms: cleanText(r[5]),
      hasMonthlyFee: fee === 'O' ? 'O' : fee === 'X' ? 'X' : null,
      depositPaidDate: parseDate(r[7]),
      depositReturnedDate: parseDate(r[8]),
      memo: cleanText(r[9]),
      displayOrder: conRows.length + 1,
    })
  }
  if (conRows.length) await db.insert(exclusiveContract).values(conRows)

  console.log(`📊 보증금 ${depRows.length}건, 전속매체 계약 ${conRows.length}건`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
