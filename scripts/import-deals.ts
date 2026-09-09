import './_env'
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/lib/db/client'
import {
  account,
  counterparty,
  deal,
  dealCategory,
  salesMethod,
  users,
} from '../src/lib/db/schema'
import {
  cleanText,
  counterpartyKey,
  extractCurrency,
  loadWorkbook,
  mapAccount,
  mapDealCategory,
  mapPaidStatus,
  mapSalesMethod,
  mapUserName,
  numStr,
  parseDate,
  parseMonth,
  parseNumber,
  parseYear,
  sheetToRows,
} from './import-utils'

type LookupMaps = {
  catCodeToId: Map<string, number>
  accountCodeToId: Map<string, number>
  salesMethodCodeToId: Map<string, number>
  userNameToId: Map<string, string>
  counterpartyKeyToId: Map<string, string>
  counterpartyNameToId: Map<string, string>
}

async function buildLookupMaps(): Promise<LookupMaps> {
  const cats = await db.select().from(dealCategory)
  const accs = await db.select().from(account)
  const sms = await db.select().from(salesMethod)
  const us = await db.select().from(users)
  const cps = await db.select().from(counterparty)

  return {
    catCodeToId: new Map(cats.map((c) => [c.code, c.id])),
    accountCodeToId: new Map(accs.map((a) => [a.code, a.id])),
    salesMethodCodeToId: new Map(sms.map((s) => [s.code, s.id])),
    userNameToId: new Map(us.map((u) => [u.name, u.id])),
    counterpartyKeyToId: new Map(cps.map((c) => [counterpartyKey(c.name), c.id])),
    counterpartyNameToId: new Map(cps.map((c) => [c.name, c.id])),
  }
}

function findCounterparty(name: string | null, maps: LookupMaps): string | null {
  if (!name) return null
  // exact match
  const byName = maps.counterpartyNameToId.get(name)
  if (byName) return byName
  // fuzzy key match
  const byKey = maps.counterpartyKeyToId.get(counterpartyKey(name))
  return byKey ?? null
}

type DealRow = typeof deal.$inferInsert

/** 한 거래시트의 한 행을 DealRow로 변환 */
function parseDealRow(
  r: unknown[],
  source: '원화' | '외화' | 'IP',
  maps: LookupMaps,
  warnings: string[],
  rowNum: number,
): DealRow | null {
  const dealCodeRaw = cleanText(r[2])
  if (!dealCodeRaw) return null

  // 귀속 — IP시트는 '23년12월' 같은 케이스도 있음
  let accrualYear = parseYear(r[3])
  let accrualMonth = parseMonth(r[4])
  // IP시트 col[4]가 '23년12월'인 경우 — col[3]이 비어있을 수 있음
  if (!accrualYear) accrualYear = parseYear(r[4])

  // Fallback: 거래코드 [Prefix][YYMMDD][-N]에서 추출
  const codeMatch = dealCodeRaw.match(/^[A-Z]+(\d{2})(\d{2})(\d{2})/)
  if (codeMatch) {
    const yy = parseInt(codeMatch[1], 10)
    const mm = parseInt(codeMatch[2], 10)
    if (!accrualYear) accrualYear = yy < 50 ? 2000 + yy : 1900 + yy
    if (!accrualMonth && mm >= 1 && mm <= 12) accrualMonth = mm
  }

  if (!accrualYear) {
    warnings.push(`${source} R${rowNum}: 귀속연도 누락 (deal=${dealCodeRaw})`)
    return null
  }
  if (!accrualMonth) {
    // 광고시작에서 추출 시도
    const start = parseDate(r[22])
    if (start) accrualMonth = parseInt(start.slice(5, 7), 10)
  }
  if (!accrualMonth) {
    warnings.push(`${source} R${rowNum}: 귀속월 누락 (deal=${dealCodeRaw})`)
    return null
  }

  const categoryCode = mapDealCategory(r[5])
  const ownerName = mapUserName(r[6])
  const ownerId = ownerName ? maps.userNameToId.get(ownerName) ?? null : null

  // 매출
  const salesMethodCode = mapSalesMethod(r[7])
  const issuer = findCounterparty(cleanText(r[19]), maps)
  const advertiser = findCounterparty(cleanText(r[20]), maps)
  const itemName = cleanText(r[21])
  const adStart = parseDate(r[22])
  const adEnd = parseDate(r[23])
  const accountCode = mapAccount(r[24])
  const salesNet = parseNumber(r[25])
  const salesVat = parseNumber(r[26])
  const salesGross = parseNumber(r[27])
  const salesDue = parseDate(r[8])
  const salesPaid = parseDate(r[9])
  const salesPaidStatus = mapPaidStatus(r[10])
  const salesInvoice = parseDate(r[11])
  const salesMemo = cleanText(r[12])

  // 매입
  const supplier = findCounterparty(cleanText(r[28]), maps)
  const settleYear = parseYear(r[13])
  const settleMonth = parseMonth(r[14])
  const purchasePricing = cleanText(r[29])
  // col 30=입금가 (보조), 31=매입금, 32=부가세, 33=총매입금
  // 외화/IP는 col 위치가 약간 다를 수 있음 — 같은 인덱스 가정
  const purchaseNet = parseNumber(r[31])
  const purchaseVat = parseNumber(r[32])
  const purchaseGross = parseNumber(r[33])
  const purchaseDue = parseDate(r[14]) // 결산예정일 — 날짜형만 (텍스트 '3월'은 null)
  const purchasePaidDate = parseDate(r[17])
  const purchasePaidStatus = mapPaidStatus(r[16])
  const purchaseInvoice = parseDate(r[15])
  const purchaseMemo = cleanText(r[18])

  // 통화 결정 (외화 시트만)
  let currency = 'KRW'
  if (source === '외화') {
    const c = extractCurrency(salesMemo) ?? extractCurrency(purchaseMemo)
    if (c) currency = c
  }

  // IP 시트 — 메모에 쉐어룰 표시 추가
  let finalSalesMemo = salesMemo
  if (source === 'IP') {
    finalSalesMemo = (salesMemo ? salesMemo + ' | ' : '') + 'IP 20% share to 이나린'
  }

  return {
    dealCode: dealCodeRaw,
    accrualYear,
    accrualMonth,
    ownerUserId: ownerId,
    categoryId: maps.catCodeToId.get(categoryCode) ?? null,
    accountId: maps.accountCodeToId.get(accountCode) ?? null,
    currency,
    status: 'confirmed',
    salesMethodId: salesMethodCode ? maps.salesMethodCodeToId.get(salesMethodCode) ?? null : null,
    issuerCounterpartyId: issuer,
    advertiserCounterpartyId: advertiser,
    advertiserName: cleanText(r[20]),
    itemName,
    adStart,
    adEnd,
    salesAmountNet: numStr(salesNet),
    salesVat: numStr(salesVat),
    salesAmountGross: numStr(salesGross),
    salesDueDate: salesDue,
    salesPaidDate: salesPaid,
    salesPaidStatus,
    salesInvoiceDate: salesInvoice,
    salesMemo: finalSalesMemo,
    supplierCounterpartyId: supplier,
    settlementYear: settleYear,
    settlementMonth: settleMonth,
    purchasePricingRaw: purchasePricing,
    purchaseAmountNet: numStr(purchaseNet),
    purchaseVat: numStr(purchaseVat),
    purchaseAmountGross: numStr(purchaseGross),
    purchaseDueDate: purchaseDue,
    purchasePaidDate: purchasePaidDate,
    purchasePaidStatus,
    purchaseInvoiceDate: purchaseInvoice,
    purchaseMemo,
  }
}

/** 거래코드 중복 시 -N suffix 자동 부여 */
function deduplicateDealCodes(rows: DealRow[]): { rows: DealRow[]; warnings: string[] } {
  const seen = new Set<string>()
  const warnings: string[] = []
  const out: DealRow[] = []
  for (const r of rows) {
    let code = r.dealCode
    if (seen.has(code)) {
      // 이미 -N 형태면 N+1 시도, 아니면 -2부터
      const match = code.match(/^(.*?)-(\d+)$/)
      const base = match ? match[1] : code
      let n = match ? parseInt(match[2], 10) + 1 : 2
      while (seen.has(`${base}-${n}`)) n++
      const newCode = `${base}-${n}`
      warnings.push(`거래코드 중복: ${code} → ${newCode}`)
      code = newCode
    }
    seen.add(code)
    out.push({ ...r, dealCode: code })
  }
  return { rows: out, warnings }
}

async function importSheet(
  source: '원화' | '외화' | 'IP',
  sheetName: string,
  startRow: number,
  maps: LookupMaps,
): Promise<{ valid: DealRow[]; warnings: string[] }> {
  const wb = loadWorkbook()
  const rows = sheetToRows(wb, sheetName)
  const valid: DealRow[] = []
  const warnings: string[] = []

  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i]
    const parsed = parseDealRow(r, source, maps, warnings, i + 1)
    if (parsed) valid.push(parsed)
  }

  return { valid, warnings }
}

async function main() {
  await db.execute(sql`TRUNCATE TABLE deal CASCADE`)
  console.log('🧹 deal truncated')

  const maps = await buildLookupMaps()
  console.log(
    `📚 Loaded lookups: ${maps.catCodeToId.size} categories, ${maps.userNameToId.size} users, ${maps.counterpartyKeyToId.size} counterparties`,
  )

  console.log('\n📥 Importing 원화매출매입...')
  const krw = await importSheet('원화', '원화매출매입', 8, maps)
  console.log(`   ✓ parsed: ${krw.valid.length}건, warnings: ${krw.warnings.length}`)

  console.log('\n📥 Importing 외화매출매입...')
  const fx = await importSheet('외화', '외화매출매입', 8, maps)
  console.log(`   ✓ parsed: ${fx.valid.length}건, warnings: ${fx.warnings.length}`)

  console.log('\n📥 Importing IP&협찬건...')
  const ip = await importSheet('IP', 'IP&협찬건', 5, maps)
  console.log(`   ✓ parsed: ${ip.valid.length}건, warnings: ${ip.warnings.length}`)

  // 모두 합치고 중복 거래코드 처리
  const allRows = [...krw.valid, ...fx.valid, ...ip.valid]
  const dedup = deduplicateDealCodes(allRows)
  console.log(`\n🔧 Deduplicated: ${dedup.warnings.length} codes renamed`)

  // 일괄 insert (chunk로)
  const CHUNK = 200
  for (let i = 0; i < dedup.rows.length; i += CHUNK) {
    const chunk = dedup.rows.slice(i, i + CHUNK)
    await db.insert(deal).values(chunk)
  }

  // 통계
  const total = await db.select({ c: sql<number>`count(*)::int` }).from(deal)
  console.log(`\n📊 Total deals: ${total[0].c}건`)

  // 경고 로그 (앞 10개만)
  const allWarnings = [...krw.warnings, ...fx.warnings, ...ip.warnings, ...dedup.warnings]
  if (allWarnings.length) {
    console.log(`\n⚠️  Warnings (${allWarnings.length} total, showing first 10):`)
    for (const w of allWarnings.slice(0, 10)) console.log(`   - ${w}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
