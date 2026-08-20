import './_env'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../src/lib/db/client'
import { counterparty } from '../src/lib/db/schema'
import { cleanBizNo, cleanText, loadWorkbook, sheetToRows, splitBankAccount } from './import-utils'

/**
 * 1회성: 거래처관리 시트의 '은행명'(col 12) 컬럼을 기존 counterparty.bank_name 에 백필.
 * 초기 import 때 해당 컬럼이 누락됐던 건 보정. 사업자번호 → 상호명 순으로 매칭.
 */
async function main() {
  const wb = loadWorkbook()
  const rows = sheetToRows(wb, '거래처관리')
  let updated = 0
  for (let i = 7; i < rows.length; i++) {
    const r = rows[i]
    const name = cleanText(r[2])
    if (!name) continue
    const bizNo = cleanBizNo(r[3])
    const raw = cleanText(r[11])
    const bankName = cleanText(r[12]) ?? splitBankAccount(raw).bankName
    if (!bankName) continue
    const where = bizNo
      ? and(eq(counterparty.businessNo, bizNo), isNull(counterparty.bankName))
      : and(eq(counterparty.name, name), isNull(counterparty.bankName))
    const res = await db.update(counterparty).set({ bankName }).where(where).returning({ id: counterparty.id })
    updated += res.length
  }
  const [{ c, b }] = await db
    .select({ c: sql<number>`count(*)::int`, b: sql<number>`count(bank_name)::int` })
    .from(counterparty)
    .where(sql`account_no is not null`)
  console.log(`✓ bank_name 백필 ${updated}건 · 계좌 보유 ${c}건 중 은행명 ${b}건`)
  process.exit(0)
}
main()
