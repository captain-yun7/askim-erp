import './_env'
import { sql } from 'drizzle-orm'
import { db } from '../src/lib/db/client'
import { counterparty, users } from '../src/lib/db/schema'
import {
  cleanBizNo,
  cleanText,
  counterpartyKey,
  splitBankAccount,
  loadWorkbook,
  sheetToRows,
} from './import-utils'

/**
 * Counterparty import
 * Step 1: 거래처관리 시트 → counterparty (287건)
 * Step 2: 거래 시트 3개에서 등장하는 상호 중 누락분 → 자동 생성
 */

async function importMaster(rows: unknown[][]): Promise<number> {
  // 헤더는 R7 (index 6). 데이터는 R8부터.
  // col: 1=No, 2=상호명, 3=사업자번호, 4=대표자, 5=주소, 6=업태, 7=종목,
  //      8=전화, 9=담당자, 10=메일, 11=계좌, 12=은행, 13=예금주,
  //      14=공식수수료, 15=비공식수수료, 16=결제일, 17=비고
  const records: typeof counterparty.$inferInsert[] = []
  for (let i = 7; i < rows.length; i++) {
    const r = rows[i]
    const name = cleanText(r[2])
    if (!name) continue
    records.push({
      name,
      businessNo: cleanBizNo(r[3]),
      ceo: cleanText(r[4]),
      address: cleanText(r[5]),
      businessType: cleanText(r[6]),
      businessCategory: cleanText(r[7]),
      phone: cleanText(r[8]),
      contactPerson: cleanText(r[9]),
      email: cleanText(r[10]),
      bankAccountRaw: cleanText(r[11]),
      // 은행명 컬럼(12) 우선, 없으면 계좌 원문에서 괄호/꼬리 텍스트 추출
      bankName: cleanText(r[12]) ?? splitBankAccount(cleanText(r[11])).bankName,
      accountNo: splitBankAccount(cleanText(r[11])).accountNo,
      accountHolder: cleanText(r[13]),
      officialFeeRate: cleanText(r[14]),
      unofficialFeeRate: cleanText(r[15]),
      paymentTerm: cleanText(r[16]),
      memo: cleanText(r[17]),
      roleTags: [],
      isActive: true,
    })
  }
  if (records.length === 0) return 0
  // upsert by business_no (있을 때), 없으면 name 기준은 unique 아니므로 그냥 insert
  await db.insert(counterparty).values(records)
  return records.length
}

async function autoCreateFromDeals(wb: ReturnType<typeof loadWorkbook>) {
  // 이미 등록된 거래처 set
  const existing = await db.select({ name: counterparty.name }).from(counterparty)
  const existingKeys = new Set(existing.map((c) => counterpartyKey(c.name)))
  const existingNames = new Set(existing.map((c) => c.name))

  const mentionedSet = new Map<string, string>() // key → original name (첫 등장 표기 유지)

  // 거래시트에서 거래처명 컬럼 추출
  const collectFrom = (sheetName: string, startRow: number, cols: number[]) => {
    const rows = sheetToRows(wb, sheetName)
    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i]
      // deal_code 있는 행만 (실제 거래)
      if (!cleanText(r[2])) continue
      for (const c of cols) {
        const name = cleanText(r[c])
        if (!name) continue
        // 의심 패턴 필터링: "2025. 12월 광고료" 같은 line item
        if (/^\d{4}\.\s*\d+월/.test(name)) continue
        const key = counterpartyKey(name)
        if (existingKeys.has(key) || existingNames.has(name)) continue
        if (!mentionedSet.has(key)) mentionedSet.set(key, name)
      }
    }
  }

  // 원화매출매입 (헤더 R8, 데이터 R9~). col 19=발행처, 20=실광고주, 28=매입처
  collectFrom('원화매출매입', 8, [19, 20, 28])
  // 외화매출매입 — 동일
  collectFrom('외화매출매입', 8, [19, 20, 28])
  // IP&협찬건 (헤더 R5, 데이터 R6~). col 19=거래처명, 20=실광고주, (매입처 위치 다름)
  collectFrom('IP&협찬건', 5, [19, 20])

  if (mentionedSet.size === 0) return 0
  const rows: typeof counterparty.$inferInsert[] = Array.from(mentionedSet.values()).map((name) => ({
    name,
    roleTags: [],
    memo: 'auto-created from deal import',
    isActive: true,
  }))
  await db.insert(counterparty).values(rows)
  return rows.length
}

async function main() {
  // 기존 데이터 제거 (재실행 가능)
  // TRUNCATE ... CASCADE 는 counterparty 를 참조하는 deposit 까지 비우므로(2026-09-08 발견) 보증금은 링크만 끊고 보존.
  // deal/expense 는 바로 이어서 각자 재적재됨.
  await db.execute(sql`UPDATE deposit SET counterparty_id = NULL`)
  await db.execute(sql`TRUNCATE TABLE deal, expense`)
  await db.execute(sql`DELETE FROM counterparty`)
  console.log('🧹 counterparty cleared (deposit 보존)')

  const wb = loadWorkbook()

  console.log('📥 Step 1: 거래처관리 → counterparty')
  const masterCount = await importMaster(sheetToRows(wb, '거래처관리'))
  console.log(`   ✓ ${masterCount}건 등록`)

  console.log('📥 Step 2: 거래시트에서 누락 거래처 자동 생성')
  const autoCount = await autoCreateFromDeals(wb)
  console.log(`   ✓ ${autoCount}건 자동 생성`)

  // 보증금 ↔ 거래처 재연결 (이름 일치분)
  await db.execute(sql`UPDATE deposit d SET counterparty_id = c.id FROM counterparty c WHERE d.counterparty_name = c.name`)

  // 최종 카운트
  const total = await db.select({ c: sql<number>`count(*)::int` }).from(counterparty)
  console.log(`\n📊 Total counterparty: ${total[0].c}건`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
