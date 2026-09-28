import './_env'
import { eq, like } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty, deal, dealCategory, users } from '@/lib/db/schema'

/** 매출분석보고서 e2e 픽스처 — 다른 데이터와 섞이지 않게 2031년 3월(+1월 1건)에 거래 4건 */
async function main() {
  await db.delete(deal).where(like(deal.itemName, 'E2E거래0928%'))
  await db.delete(counterparty).where(like(counterparty.name, 'E2E거래처0928%'))
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@askim.local')).limit(1)
  const cats = await db.select().from(dealCategory)
  const cat = (code: string) => cats.find((c) => c.code === code)!.id
  const [a, b, s] = await db
    .insert(counterparty)
    .values([
      { name: 'E2E거래처0928-A', roleTags: ['advertiser'], clientType: 'direct' },
      { name: 'E2E거래처0928-B', roleTags: ['agency'] },
      { name: 'E2E거래처0928-매체', roleTags: ['media'] },
    ])
    .returning({ id: counterparty.id })
  const base = { accrualYear: 2031, accrualMonth: 3, currency: 'KRW' as const, status: 'confirmed' as const, ownerUserId: admin.id, createdBy: admin.id }
  await db.insert(deal).values([
    { ...base, dealCode: 'E2E0928-1', itemName: 'E2E거래0928-1', issuerCounterpartyId: a.id, supplierCounterpartyId: s.id, categoryId: cat('overseas'), salesAmountNet: '3000000', salesVat: '300000', salesAmountGross: '3300000', purchaseAmountNet: '2000000', purchaseVat: '200000', purchaseAmountGross: '2200000' },
    { ...base, dealCode: 'E2E0928-2', itemName: 'E2E거래0928-2', issuerCounterpartyId: b.id, supplierCounterpartyId: s.id, categoryId: cat('sales_agency'), salesAmountNet: '1000000', salesVat: '100000', salesAmountGross: '1100000', purchaseAmountNet: '500000', purchaseVat: '50000', purchaseAmountGross: '550000' },
    { ...base, dealCode: 'E2E0928-3', itemName: 'E2E거래0928-3', issuerCounterpartyId: b.id, categoryId: cat('sales_agency'), salesAmountNet: '1000000', salesVat: '100000', salesAmountGross: '1100000' },
    { ...base, accrualMonth: 1, dealCode: 'E2E0928-4', itemName: 'E2E거래0928-4', issuerCounterpartyId: a.id, categoryId: cat('overseas'), salesAmountNet: '5000000', salesVat: '500000', salesAmountGross: '5500000', purchaseAmountNet: '1000000', purchaseVat: '100000', purchaseAmountGross: '1100000' },
  ])
  console.log('fixture-0928 ready')
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
