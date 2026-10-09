import './_env'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty, deal } from '@/lib/db/schema'

/** 2026-10-08 스펙용 — 팀장 거래의 입금예정일을 지난달로(미입금), 거래처 A 에 계좌정보 */
async function main() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1, 15)
  const lastMonth = d.toISOString().slice(0, 10)
  await db.update(deal).set({ salesDueDate: lastMonth, salesPaidStatus: 'pending' }).where(eq(deal.dealCode, 'E2E0916-LEAD'))
  const [cp] = await db.select({ id: counterparty.id }).from(counterparty).where(eq(counterparty.name, 'E2E거래처0916-A')).limit(1)
  if (cp) {
    await db.update(counterparty).set({ bankName: 'E2E은행', accountNo: '123-456-789', accountHolder: 'E2E예금주' }).where(eq(counterparty.id, cp.id))
    await db.update(deal).set({ supplierCounterpartyId: cp.id, purchaseAmountNet: '100000', purchaseVat: '10000', purchaseAmountGross: '110000' }).where(eq(deal.dealCode, 'E2E0916-MEMBER'))
  }
  console.log('fixture-1008 ready', lastMonth)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
