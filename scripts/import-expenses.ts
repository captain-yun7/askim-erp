import './_env'
import { sql } from 'drizzle-orm'
import { db } from '../src/lib/db/client'
import { counterparty, expense, expenseCategory } from '../src/lib/db/schema'
import {
  cleanText,
  counterpartyKey,
  loadWorkbook,
  mapExpenseCategory,
  numStr,
  parseDate,
  parseNumber,
  sheetToRows,
} from './import-utils'

async function main() {
  await db.execute(sql`TRUNCATE TABLE expense CASCADE`)
  console.log('🧹 expense truncated')

  const catRows = await db.select().from(expenseCategory)
  const catCodeToId = new Map(catRows.map((c) => [c.code, c.id]))

  const cpRows = await db.select({ id: counterparty.id, name: counterparty.name }).from(counterparty)
  const cpNameToId = new Map(cpRows.map((c) => [c.name, c.id]))
  const cpKeyToId = new Map(cpRows.map((c) => [counterpartyKey(c.name), c.id]))

  const wb = loadWorkbook()

  // 판관비 외 — 헤더 R3 (idx 2), 데이터 R4 (idx 3)~
  // col: 0=No, 1=연도, 2=월, 3=지출일, 4=품목, 5=합계, 6=거래처, 7=거래항목
  const rows = sheetToRows(wb, '판관비 외')
  const records: typeof expense.$inferInsert[] = []
  const warnings: string[] = []

  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]
    const expenseDate = parseDate(r[3])
    const amount = parseNumber(r[5])
    if (!expenseDate || !amount) continue

    const itemName = cleanText(r[4])
    const cpText = cleanText(r[6])
    const catCode = mapExpenseCategory(r[7])

    // 거래처 매칭 (있을 때만 FK)
    let cpId: string | null = null
    if (cpText) {
      cpId = cpNameToId.get(cpText) ?? cpKeyToId.get(counterpartyKey(cpText)) ?? null
    }

    records.push({
      expenseDate,
      itemName,
      amount: numStr(amount)!,
      counterpartyId: cpId,
      counterpartyText: cpText,
      expenseCategoryId: catCodeToId.get(catCode) ?? null,
      paymentMethod: 'corporate_card',
    })
  }

  console.log(`📥 판관비 외 → expense: ${records.length}건 준비`)

  const CHUNK = 500
  for (let i = 0; i < records.length; i += CHUNK) {
    await db.insert(expense).values(records.slice(i, i + CHUNK))
  }

  // 개인카드, 현금사용 — 컬럼 위치는 시트마다 다를 수 있어 동적 탐지
  const personalRows = sheetToRows(wb, '개인카드, 현금사용')
  // 헤더 행 찾기
  let pStart = 0
  for (let i = 0; i < Math.min(10, personalRows.length); i++) {
    if (personalRows[i].some((v) => v === '처리일' || v === '지출일')) {
      pStart = i + 1
      break
    }
  }
  const personalRecords: typeof expense.$inferInsert[] = []
  for (let i = pStart; i < personalRows.length; i++) {
    const r = personalRows[i]
    // 처리일 컬럼 위치도 동적으로
    const expenseDate = parseDate(r[2]) ?? parseDate(r[3])
    const amount = parseNumber(r[6]) ?? parseNumber(r[7]) ?? parseNumber(r[5])
    if (!expenseDate || !amount) continue
    const cpText = cleanText(r[7]) ?? cleanText(r[8])
    const catCode = mapExpenseCategory(r[8] ?? r[9])
    let cpId: string | null = null
    if (cpText) {
      cpId = cpNameToId.get(cpText) ?? cpKeyToId.get(counterpartyKey(cpText)) ?? null
    }
    personalRecords.push({
      expenseDate,
      itemName: cleanText(r[4]),
      amount: numStr(amount)!,
      vat: numStr(parseNumber(r[6])),
      counterpartyId: cpId,
      counterpartyText: cpText,
      expenseCategoryId: catCodeToId.get(catCode) ?? null,
      paymentMethod: 'personal_card',
    })
  }
  if (personalRecords.length) {
    await db.insert(expense).values(personalRecords)
    console.log(`📥 개인카드/현금 → expense: ${personalRecords.length}건`)
  }

  const total = await db.select({ c: sql<number>`count(*)::int`, s: sql<string>`coalesce(sum(amount),0)::text` }).from(expense)
  console.log(`\n📊 Total expenses: ${total[0].c}건, 합계: ${parseFloat(total[0].s).toLocaleString()}`)

  if (warnings.length) {
    console.log(`\n⚠️  Warnings: ${warnings.length}`)
    for (const w of warnings.slice(0, 10)) console.log(`   - ${w}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
