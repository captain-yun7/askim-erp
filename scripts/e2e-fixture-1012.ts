import './_env'
import { eq, like } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal, users } from '@/lib/db/schema'

/** 2026-10-12 요청 스펙용 — 환율이 있는 미국법인 거래 1건 (손익 400 USD × 1,300 = 520,000원) */
async function main() {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@askim.local')).limit(1)
  await db.delete(deal).where(like(deal.itemName, 'E2E거래US-FX%'))
  await db.insert(deal).values({
    entity: 'us', dealCode: 'E2EUS-FX', accrualYear: 2026, accrualMonth: 9, currency: 'USD', status: 'confirmed', ownerUserId: admin.id, createdBy: admin.id,
    itemName: 'E2E거래US-FX', salesAmountNet: '1000', salesAmountGross: '1000', purchaseAmountNet: '600', purchaseAmountGross: '600', fxRate: '1300', salesPaidDate: '2026-09-30',
  })
  console.log('fixture-1012 ready')
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
