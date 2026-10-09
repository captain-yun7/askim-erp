/**
 * 미국법인(BloomingTerra) 워크북 적재 (2026-10-08 요청) — entity='us'
 *   DRY_RUN=1 npx tsx scripts/import-us.ts "<엑셀 경로>"
 *
 * '미국법인' 시트(헤더 R8): 한국 원화 시트에서 부가세·매출수단·계산서 발행일 열이 빠지고 환율 열이 들어간 구조.
 *   금액은 USD, VAT 없음 → sales/purchase gross = net, vat null, currency USD, fx_rate = 적용환율(귀속월 말일자).
 *   성과급은 시트가 손익×5% 고정 → commission_pct 0.05.
 * 'SG&A' 시트는 한국 '판관비 외' 와 같은 자리(헤더 R3), 합계가 USD.
 * 같은 (법인, 거래코드)·같은 지출(날짜·금액·품목·거래처)은 건너뛰어 다시 돌려도 중복되지 않는다.
 */
import './_env'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { account, counterparty, deal, dealCategory, expense, expenseCategory, users } from '@/lib/db/schema'
import { dupKey } from '@/lib/expense-upload'
import { cleanText, counterpartyKey, loadWorkbook, mapAccount, mapDealCategory, mapExpenseCategory, mapPaidStatus, mapUserName, numStr, parseDate, parseMonth, parseNumber, parseYear, sheetToRows } from './import-utils'

const ENTITY = 'us'
const DRY = process.env.DRY_RUN === '1'

// 열 위치 (0 = A)
const C = { code: 2, year: 3, month: 4, category: 5, owner: 6, salesDue: 7, salesPaid: 8, salesStatus: 9, salesMemo: 10, settleYear: 11, settleMonth: 12, purchaseStatus: 13, purchasePaid: 14, purchaseMemo: 15, issuer: 16, advertiser: 17, item: 18, adStart: 19, adEnd: 20, account: 21, salesUsd: 22, supplier: 23, pricing: 24, purchaseUsd: 26, fx: 27 }

async function ensureCounterparty(name: string | null, cache: Map<string, string>, created: string[]): Promise<string | null> {
  if (!name) return null
  const key = counterpartyKey(name)
  const hit = cache.get(key)
  if (hit) return hit
  if (DRY) {
    created.push(name)
    cache.set(key, `dry-${key}`)
    return null
  }
  const [row] = await db.insert(counterparty).values({ entity: ENTITY, name, memo: 'auto-created from US deal import' }).returning({ id: counterparty.id })
  cache.set(key, row.id)
  created.push(name)
  return row.id
}

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('엑셀 경로를 넘겨 주세요')
  const wb = loadWorkbook(file)
  const [cats, accs, us, cps] = await Promise.all([
    db.select().from(dealCategory),
    db.select().from(account),
    db.select().from(users),
    db.select({ id: counterparty.id, name: counterparty.name }).from(counterparty).where(eq(counterparty.entity, ENTITY)),
  ])
  const catId = new Map(cats.map((c) => [c.code, c.id]))
  const accId = new Map(accs.map((a) => [a.code, a.id]))
  const userId = new Map(us.map((u) => [u.name, u.id]))
  const cpCache = new Map(cps.map((c) => [counterpartyKey(c.name), c.id]))
  const createdCps: string[] = []

  // ── 거래
  const rows = sheetToRows(wb, '미국법인')
  const existing = new Set((await db.select({ code: deal.dealCode }).from(deal).where(eq(deal.entity, ENTITY))).map((r) => r.code))
  const seen = new Set<string>()
  const toInsert: (typeof deal.$inferInsert)[] = []
  const warnings: string[] = []
  for (let i = 8; i < rows.length; i++) {
    const r = rows[i]
    const code = cleanText(r[C.code])
    if (!code) continue
    const salesNet = parseNumber(r[C.salesUsd])
    const purchaseNet = parseNumber(r[C.purchaseUsd])
    if (seen.has(code)) {
      // 같은 코드가 두 행 — 금액 없는 쪽은 성과급 분배 행. 금액 있는 행을 거래로 삼는다
      const prev = toInsert.findIndex((d) => d.dealCode === code)
      const prevHasAmount = prev >= 0 && (toInsert[prev].salesAmountNet || toInsert[prev].purchaseAmountNet)
      if (!salesNet && !purchaseNet) {
        warnings.push(`R${i + 1} ${code}: 중복 코드(금액 없음) 건너뜀`)
        continue
      }
      if (prevHasAmount) {
        warnings.push(`R${i + 1} ${code}: 중복 코드(둘 다 금액 있음) — 확인 필요, 건너뜀`)
        continue
      }
      if (prev >= 0) {
        warnings.push(`R${i + 1} ${code}: 앞의 금액 없는 행 대신 이 행을 씀`)
        toInsert.splice(prev, 1)
      }
    }
    seen.add(code)
    if (existing.has(code)) continue
    const year = parseYear(r[C.year])
    const month = parseMonth(r[C.month])
    if (!year || !month) {
      warnings.push(`R${i + 1} ${code}: 귀속연월 없음`)
      continue
    }
    const ownerName = mapUserName(r[C.owner])
    const owner = ownerName ? (userId.get(ownerName) ?? null) : null
    if (r[C.owner] && !owner) warnings.push(`R${i + 1} ${code}: 담당자 '${cleanText(r[C.owner])}' 없음`)
    const fx = parseNumber(r[C.fx])
    const issuer = await ensureCounterparty(cleanText(r[C.issuer]), cpCache, createdCps)
    const supplier = await ensureCounterparty(cleanText(r[C.supplier]), cpCache, createdCps)
    toInsert.push({
      entity: ENTITY,
      dealCode: code,
      accrualYear: year,
      accrualMonth: month,
      categoryId: catId.get(mapDealCategory(r[C.category])) ?? null,
      accountId: accId.get(mapAccount(r[C.account])) ?? null,
      ownerUserId: owner,
      currency: 'USD',
      fxRate: fx != null ? String(fx) : null,
      issuerCounterpartyId: issuer,
      advertiserName: cleanText(r[C.advertiser]),
      itemName: cleanText(r[C.item]),
      adStart: parseDate(r[C.adStart]),
      adEnd: parseDate(r[C.adEnd]),
      salesAmountNet: numStr(salesNet),
      salesVat: null,
      salesAmountGross: numStr(salesNet),
      salesDueDate: parseDate(r[C.salesDue]),
      salesPaidDate: parseDate(r[C.salesPaid]),
      salesPaidStatus: mapPaidStatus(r[C.salesStatus]),
      salesMemo: cleanText(r[C.salesMemo]),
      supplierCounterpartyId: supplier,
      settlementYear: parseYear(r[C.settleYear]),
      settlementMonth: parseMonth(r[C.settleMonth]),
      purchasePricingRaw: cleanText(r[C.pricing]),
      purchaseAmountNet: numStr(purchaseNet),
      purchaseVat: null,
      purchaseAmountGross: numStr(purchaseNet),
      purchasePaidDate: parseDate(r[C.purchasePaid]),
      purchasePaidStatus: mapPaidStatus(r[C.purchaseStatus]),
      purchaseMemo: cleanText(r[C.purchaseMemo]),
      commissionPct: '0.0500',
      status: 'confirmed',
    })
  }

  // ── SG&A (판관비)
  const sg = sheetToRows(wb, 'SG&A')
  const expCats = await db.select().from(expenseCategory)
  const expCatId = new Map(expCats.map((c) => [c.code, c.id]))
  const have = new Set((await db.select({ expenseDate: expense.expenseDate, amount: expense.amount, itemName: expense.itemName, counterpartyText: expense.counterpartyText }).from(expense).where(eq(expense.entity, ENTITY))).map(dupKey))
  const expRows: (typeof expense.$inferInsert)[] = []
  for (let i = 3; i < sg.length; i++) {
    const r = sg[i]
    const expenseDate = parseDate(r[3])
    const amount = parseNumber(r[5])
    if (!expenseDate || !amount) continue
    const rec = { entity: ENTITY, expenseDate, itemName: cleanText(r[4]), amount: numStr(amount)!, counterpartyText: cleanText(r[6]), expenseCategoryId: expCatId.get(mapExpenseCategory(r[7])) ?? null, paymentMethod: 'corporate_card' as const }
    const k = dupKey({ expenseDate: rec.expenseDate, amount: rec.amount, itemName: rec.itemName, counterpartyText: rec.counterpartyText })
    if (have.has(k)) continue
    have.add(k)
    expRows.push(rec)
  }

  console.log(`${DRY ? '🔍 DRY RUN' : '✍️  IMPORT'} 미국법인 — ${file}`)
  console.log(`[거래] 시트 ${seen.size}코드 / 이미 있음 ${[...seen].filter((c) => existing.has(c)).length} / 추가 ${toInsert.length}: ${toInsert.map((r) => r.dealCode).join(' ')}`)
  console.log(`[거래처] 새로 만듦 ${createdCps.length}: ${createdCps.join(', ') || '-'}`)
  console.log(`[판관비] 추가 ${expRows.length}`)
  for (const w of warnings) console.log('  ⚠ ' + w)
  if (!DRY) {
    if (toInsert.length) await db.insert(deal).values(toInsert)
    for (let i = 0; i < expRows.length; i += 500) await db.insert(expense).values(expRows.slice(i, i + 500))
    console.log('✓ 완료')
  }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
