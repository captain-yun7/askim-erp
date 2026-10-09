import './_env'
import { eq, like } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty, deal, users } from '@/lib/db/schema'

/** 법인 분리 스펙용 — 미국법인 거래·거래처 1건씩 */
async function main() {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@askim.local')).limit(1)
  await db.delete(deal).where(like(deal.itemName, 'E2E거래US%'))
  await db.delete(counterparty).where(like(counterparty.name, 'E2E거래처US%'))
  const [cp] = await db.insert(counterparty).values({ entity: 'us', name: 'E2E거래처US-A', roleTags: ['advertiser'], clientType: 'direct' }).returning({ id: counterparty.id })
  await db.insert(deal).values({ entity: 'us', dealCode: 'E2EUS-1', accrualYear: 2026, accrualMonth: 9, currency: 'USD', status: 'confirmed', ownerUserId: admin.id, createdBy: admin.id, issuerCounterpartyId: cp.id, itemName: 'E2E거래US-1', salesAmountNet: '15000', salesAmountGross: '15000' })
  console.log('fixture-entity ready')
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
