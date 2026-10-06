import './_env'
import * as XLSX from 'xlsx'
import { isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty, deal, dealFieldChange, users } from '@/lib/db/schema'
import { parseAllDeals } from './import-deals'
import { XLSX_FILE } from './import-utils'

/**
 * 월별 수금·결산: 엑셀(XLSX_FILE) vs 현재 DB — 칸별 차이와 그 차이를 만든 거래 (쓰기 없음)
 *   YEAR=2026 XLSX_FILE=... npx tsx scripts/compare-collection.ts
 *   OUT=<경로.xlsx> 를 주면 고객에게 보낼 수 있는 비교표(칸별 차이·원인 거래·거래별 항목 차이)를 엑셀로 쓴다.
 * 세 값을 나란히 본다: 엑셀 시트에 적힌 값 / 엑셀 거래에 ERP 식을 적용한 값 / ERP(DB) 값.
 * 앞의 둘이 다르면 계산 기준 차이, 뒤의 둘이 다르면 데이터 차이다.
 */
const YEAR = Number(process.env.YEAR ?? 2026)
const KINDS = ['매출 예정', '매입 예정', '매출 수금', '매입 결산', '매출 미수', '매입 미결산'] as const
type Kind = (typeof KINDS)[number]
type Row = Record<string, unknown> & { dealCode: string }

const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0)
const ym = (d: unknown): [number, number] | null => (typeof d === 'string' && /^\d{4}-\d{2}/.test(d) ? [Number(d.slice(0, 4)), Number(d.slice(5, 7))] : null)

/** reports-collection.ts 와 같은 식 */
function cells(rows: Row[]) {
  const out = new Map<string, Map<string, number>>()
  const add = (kind: Kind, month: number, code: string, amount: number) => {
    if (!amount) return
    const key = `${month}|${kind}`
    if (!out.has(key)) out.set(key, new Map())
    const m = out.get(key)!
    m.set(code, (m.get(code) ?? 0) + amount)
  }
  for (const r of rows) {
    const sales = r.salesAmountGross != null && r.salesAmountGross !== '' ? n(r.salesAmountGross) : n(r.salesAmountNet)
    const purchase = r.purchaseAmountGross != null && r.purchaseAmountGross !== '' ? n(r.purchaseAmountGross) : n(r.purchaseAmountNet)
    const due = ym(r.salesDueDate)
    if (due && due[0] === YEAR) {
      add('매출 예정', due[1], r.dealCode, sales)
      if (r.salesPaidStatus !== 'completed') add('매출 미수', due[1], r.dealCode, sales)
    }
    const paid = ym(r.salesPaidDate)
    if (paid && paid[0] === YEAR && r.salesPaidStatus === 'completed') add('매출 수금', paid[1], r.dealCode, sales)
    const pdue = ym(r.purchaseDueDate)
    const sy = r.settlementYear != null ? Number(r.settlementYear) : pdue?.[0]
    const sm = r.settlementMonth != null ? Number(r.settlementMonth) : pdue?.[1]
    if (sy === YEAR && sm) {
      add('매입 예정', sm, r.dealCode, purchase)
      if (r.purchasePaidStatus !== 'completed') add('매입 미결산', sm, r.dealCode, purchase)
    }
    const ppaid = ym(r.purchasePaidDate)
    if (ppaid && ppaid[0] === YEAR && r.purchasePaidStatus === 'completed') add('매입 결산', ppaid[1], r.dealCode, purchase)
  }
  return out
}

/** 엑셀 '월별 수금,결산 (YEAR)' 시트에 적힌 값 */
function sheetValues(): Map<string, number> {
  const out = new Map<string, number>()
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const name = wb.SheetNames.find((s) => s.replace(/\s/g, '').startsWith('월별수금,결산') && s.includes(String(YEAR)))
  if (!name) return out
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null })
  for (let i = 0; i < rows.length; i++) {
    const head = rows[i]
    if (!head.some((c) => c === '예상손익')) continue
    const monthsRow = rows[i - 1]
    for (const [label, a, b] of [['예정', '매출 예정', '매입 예정'], ['수금/결산', '매출 수금', '매입 결산'], ['미수/미결산', '매출 미수', '매입 미결산']] as const) {
      const row = rows.slice(i + 1, i + 4).find((r) => r[0] === label)
      if (!row) continue
      for (let c = 1; c < head.length; c += 3) {
        const month = Number(monthsRow[c])
        if (!month) continue
        out.set(`${month}|${a}`, n(row[c]))
        out.set(`${month}|${b}`, n(row[c + 1]))
      }
    }
  }
  return out
}

const won = (v: number) => Math.round(v).toLocaleString('ko-KR')
const sum = (m?: Map<string, number>) => [...(m?.values() ?? [])].reduce((a, b) => a + b, 0)

async function main() {
  const { rows: xl } = await parseAllDeals()
  const dbRows = (await db.select().from(deal).where(isNull(deal.deletedAt))) as unknown as Row[]
  const X = cells(xl as unknown as Row[])
  const D = cells(dbRows)
  const S = sheetValues()
  const xlCodes = new Set(xl.map((r) => r.dealCode))
  const dbCodes = new Set(dbRows.map((r) => r.dealCode))
  console.log(`${YEAR}년 · 엑셀 거래 ${xl.length}건 / ERP 거래 ${dbRows.length}건\n`)

  let basis = 0
  let data = 0
  for (let month = 1; month <= 12; month++) {
    for (const kind of KINDS) {
      const key = `${month}|${kind}`
      const sheet = S.get(key)
      const x = sum(X.get(key))
      const d = sum(D.get(key))
      const basisDiff = sheet !== undefined && Math.abs(sheet - x) >= 1
      const dataDiff = Math.abs(x - d) >= 1
      if (!basisDiff && !dataDiff) continue
      console.log(`■ ${month}월 ${kind}: 엑셀 시트 ${sheet === undefined ? '-' : won(sheet)} / 엑셀 거래+ERP식 ${won(x)} / ERP ${won(d)}  (ERP − 엑셀 = ${won(d - x)})`)
      if (basisDiff) {
        basis++
        console.log(`   ! 엑셀 시트 값과 엑셀 거래 합계가 다름 (${won(sheet! - x)}) — 계산 기준 또는 시트 수식 문제`)
      }
      if (dataDiff) {
        data++
        const codes = new Set([...(X.get(key)?.keys() ?? []), ...(D.get(key)?.keys() ?? [])])
        const lines = [...codes]
          .map((code) => ({ code, x: X.get(key)?.get(code) ?? 0, d: D.get(key)?.get(code) ?? 0 }))
          .filter((r) => Math.abs(r.x - r.d) >= 1)
          .sort((a, b) => Math.abs(b.d - b.x) - Math.abs(a.d - a.x))
        for (const r of lines.slice(0, 40)) {
          const why = !xlCodes.has(r.code) ? 'ERP에만 있는 거래' : !dbCodes.has(r.code) ? '엑셀에만 있는 거래' : r.x === 0 ? '엑셀에서는 이 칸에 안 잡힘' : r.d === 0 ? 'ERP에서는 이 칸에 안 잡힘' : '금액 다름'
          console.log(`   ${r.code.padEnd(16)} 엑셀 ${won(r.x).padStart(14)} / ERP ${won(r.d).padStart(14)}  ${why}`)
        }
        if (lines.length > 40) console.log(`   … 외 ${lines.length - 40}건`)
      }
    }
  }
  console.log(`\n차이 나는 칸: 데이터 차이 ${data}칸, 엑셀 시트 자체 불일치 ${basis}칸`)
  if (process.env.OUT) await writeReport(process.env.OUT, xl as unknown as Row[], dbRows, X, D, S)
  process.exit(0)
}
// ── 엑셀 비교표 ─────────────────────────────────────────────

const FIELD_LABEL: [string, string, boolean][] = [
  // [필드, 표시 이름, 수금결산표에 영향]
  ['accrualYear', '귀속연도', false], ['accrualMonth', '귀속월', false], ['ownerUserId', '담당자', false],
  ['issuerCounterpartyId', '발행처', false], ['supplierCounterpartyId', '매체사', false], ['itemName', '품목명', false],
  ['salesAmountNet', '매출금', true], ['salesVat', '매출 부가세', true], ['salesAmountGross', '총매출(VAT포함)', true],
  ['salesDueDate', '입금예정일', true], ['salesPaidDate', '입금일', true], ['salesPaidStatus', '입금여부', true], ['salesInvoiceDate', '매출 세계발행일', false],
  ['settlementYear', '결산연도', true], ['settlementMonth', '결산월', true],
  ['purchaseAmountNet', '매입금', true], ['purchaseVat', '매입 부가세', true], ['purchaseAmountGross', '총매입(VAT포함)', true],
  ['purchaseDueDate', '결산예정일', true], ['purchasePaidDate', '지급일', true], ['purchasePaidStatus', '결산여부', true], ['purchaseInvoiceDate', '매입 세계발행일', false],
]
const STATUS: Record<string, string> = { completed: '완료', pending: '미완료' }

async function writeReport(out: string, xl: Row[], dbRows: Row[], X: ReturnType<typeof cells>, D: ReturnType<typeof cells>, S: Map<string, number>) {
  const userName = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]))
  const cpName = new Map((await db.select({ id: counterparty.id, name: counterparty.name }).from(counterparty)).map((c) => [c.id, c.name]))
  const changes = await db.select().from(dealFieldChange)
  const lastChange = new Map<string, { at: Date; by: string }>()
  for (const c of changes) {
    const key = `${c.dealId}|${c.field}`
    const prev = lastChange.get(key)
    if (!prev || prev.at < c.changedAt) lastChange.set(key, { at: c.changedAt, by: userName.get(c.changedBy ?? '') ?? '-' })
  }
  const show = (field: string, v: unknown): string | number => {
    if (v == null || v === '') return ''
    if (field === 'ownerUserId') return userName.get(String(v)) ?? String(v)
    if (field.endsWith('CounterpartyId')) return cpName.get(String(v)) ?? String(v)
    if (field.endsWith('Status')) return STATUS[String(v)] ?? String(v)
    if (/Amount|Vat|Year|Month/.test(field)) return Math.round(Number(v))
    return String(v)
  }
  const same = (field: string, a: unknown, b: unknown) => {
    const x = show(field, a)
    const y = show(field, b)
    // 금액은 1원 미만 차이(소수 반올림)는 같다고 본다
    if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) < 1
    return String(x) === String(y)
  }
  const kst = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d)
  const xlBy = new Map(xl.map((r) => [r.dealCode, r]))
  const dbBy = new Map(dbRows.map((r) => [r.dealCode, r]))
  const inYear = (r: Row) => [r.accrualYear, r.settlementYear, ym(r.salesDueDate)?.[0], ym(r.salesPaidDate)?.[0], ym(r.purchaseDueDate)?.[0], ym(r.purchasePaidDate)?.[0]].some((y) => Number(y) === YEAR)

  // 1. 칸별 차이
  const s1: (string | number)[][] = [['월', '구분', '엑셀 시트 값', '엑셀 거래 합계(ERP 식)', 'ERP 값', 'ERP − 엑셀 시트', '원인']]
  const s2: (string | number)[][] = [['월', '구분', '거래코드', '엑셀 금액', 'ERP 금액', '차이(ERP−엑셀)', '상태']]
  for (let month = 1; month <= 12; month++) {
    for (const kind of KINDS) {
      const key = `${month}|${kind}`
      const sheet = S.get(key) ?? 0
      const x = sum(X.get(key))
      const d = sum(D.get(key))
      if (Math.abs(sheet - d) < 1 && Math.abs(x - d) < 1) continue
      const why = [Math.abs(x - d) >= 1 ? '거래 데이터가 다름' : '', Math.abs(sheet - x) >= 1 ? '엑셀 시트 합계가 엑셀 거래 합계와 다름' : ''].filter(Boolean).join(' + ')
      s1.push([month, kind, Math.round(sheet), Math.round(x), Math.round(d), Math.round(d - sheet), why])
      const codes = new Set([...(X.get(key)?.keys() ?? []), ...(D.get(key)?.keys() ?? [])])
      for (const code of [...codes].sort()) {
        const a = X.get(key)?.get(code) ?? 0
        const b = D.get(key)?.get(code) ?? 0
        if (Math.abs(a - b) < 1) continue
        const state = !xlBy.has(code) ? 'ERP에만 있는 거래' : !dbBy.has(code) ? '엑셀에만 있는 거래' : a === 0 ? '엑셀에서는 이 칸에 안 잡힘 (날짜·상태가 다름)' : b === 0 ? 'ERP에서는 이 칸에 안 잡힘 (날짜·상태가 다름)' : '금액이 다름'
        s2.push([month, kind, code, Math.round(a), Math.round(b), Math.round(b - a), state])
      }
    }
  }

  // 3. 거래별 항목 차이
  const s3: (string | number)[][] = [['거래코드', '항목', 'ERP 값', '엑셀 값', '수금결산표 영향', 'ERP에서 마지막으로 고친 날', '고친 사람', '판단']]
  for (const [code, x] of [...xlBy].sort((a, b) => a[0].localeCompare(b[0]))) {
    const d = dbBy.get(code)
    if (!d) continue
    for (const [field, label, affects] of FIELD_LABEL) {
      if (same(field, d[field], x[field])) continue
      const ch = lastChange.get(`${d.id}|${field}`)
      s3.push([code, label, show(field, d[field]), show(field, x[field]), affects ? '예' : '', ch ? kst(ch.at) : '', ch?.by ?? '', ch ? 'ERP에서 수정한 값 — 엑셀과 어느 쪽이 맞는지 확인' : '엑셀에서 바뀐 값 — ERP에 반영 필요'])
    }
  }

  const brief = (r: Row, side: 'xl' | 'db') => [r.dealCode, Number(r.accrualYear) || '', Number(r.accrualMonth) || '', show('ownerUserId', r.ownerUserId), show('issuerCounterpartyId', r.issuerCounterpartyId), String(r.itemName ?? ''), show('salesAmountGross', r.salesAmountGross ?? r.salesAmountNet), show('purchaseAmountGross', r.purchaseAmountGross ?? r.purchaseAmountNet), side === 'db' && r.createdAt instanceof Date ? kst(r.createdAt) : '']
  const s4: (string | number)[][] = [['거래코드', '귀속연도', '귀속월', '담당자', '발행처', '품목명', '총매출', '총매입'], ...xl.filter((r) => !dbBy.has(r.dealCode)).map((r) => brief(r, 'xl').slice(0, 8))]
  const s5: (string | number)[][] = [['거래코드', '귀속연도', '귀속월', '담당자', '발행처', '품목명', '총매출', '총매입', 'ERP 등록일'], ...dbRows.filter((r) => !xlBy.has(r.dealCode)).map((r) => brief(r, 'db'))]

  // 6. 엑셀 자체 점검: 금액은 있는데 VAT포함 칸이 빈 거래, 미래 날짜로 완료 처리된 거래
  const today = kst(new Date())
  const s6: (string | number)[][] = [['거래코드', '문제', '값']]
  for (const r of xl.filter(inYear)) {
    if (n(r.purchaseAmountNet) !== 0 && (r.purchaseAmountGross == null || r.purchaseAmountGross === '')) s6.push([r.dealCode, '매입금은 있는데 총매입(VAT포함) 칸이 비어 엑셀 수금결산 시트 합계에서 빠짐', Math.round(n(r.purchaseAmountNet))])
    if (n(r.salesAmountNet) !== 0 && (r.salesAmountGross == null || r.salesAmountGross === '')) s6.push([r.dealCode, '매출금은 있는데 총매출(VAT포함) 칸이 비어 엑셀 수금결산 시트 합계에서 빠짐', Math.round(n(r.salesAmountNet))])
    for (const [f, label] of [['salesPaidDate', '입금일'], ['purchasePaidDate', '지급일']] as const) if (typeof r[f] === 'string' && (r[f] as string) > today) s6.push([r.dealCode, `${label}이 오늘 이후 날짜`, r[f] as string])
    for (const [f, label] of [['salesDueDate', '입금예정일'], ['purchaseDueDate', '결산예정일'], ['adEnd', '광고 종료일']] as const) if (typeof r[f] === 'string' && (r[f] as string) < '2000-01-01') s6.push([r.dealCode, `${label}이 날짜가 아닌 값으로 입력됨`, r[f] as string])
  }

  const wb = XLSX.utils.book_new()
  const addSheet = (name: string, rows: (string | number)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = widths.map((wch) => ({ wch }))
    for (const addr of Object.keys(ws)) if (!addr.startsWith('!') && typeof ws[addr].v === 'number' && Math.abs(ws[addr].v) >= 1000) ws[addr].z = '#,##0'
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  addSheet('1.칸별 차이', s1, [5, 12, 16, 22, 16, 16, 46])
  addSheet('2.칸별 원인 거래', s2, [5, 12, 16, 15, 15, 15, 44])
  addSheet('3.거래별 항목 차이', s3, [16, 16, 26, 26, 14, 22, 12, 46])
  addSheet('4.엑셀에만 있는 거래', s4, [16, 9, 7, 12, 26, 40, 14, 14])
  addSheet('5.ERP에만 있는 거래', s5, [16, 9, 7, 12, 26, 40, 14, 14, 12])
  addSheet('6.엑셀 입력 점검', s6, [16, 62, 16])
  XLSX.writeFile(wb, out)
  console.log(`비교표 → ${out}  (칸 ${s1.length - 1}, 원인 거래 ${s2.length - 1}, 항목 차이 ${s3.length - 1}, 엑셀에만 ${s4.length - 1}, ERP에만 ${s5.length - 1}, 엑셀 점검 ${s6.length - 1})`)
}

main().catch((e) => { console.error(e); process.exit(1) })
