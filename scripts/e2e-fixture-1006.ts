import './_env'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal } from '@/lib/db/schema'

/** 2026-10-06 ③ 스펙용 — 팀원 거래의 매입금을 마이너스(상계)로 */
async function main() {
  await db.update(deal).set({ purchaseAmountNet: '-1300000', purchaseVat: '-130000', purchaseAmountGross: '-1430000' }).where(eq(deal.dealCode, 'E2E0916-MEMBER'))
  console.log('fixture-1006 ready')
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
