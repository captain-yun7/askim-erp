import './_env'
import { eq, like } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { deal, expense, users } from '@/lib/db/schema'

/** 2026-09-17 피드백 e2e 픽스처 — 영업 계정 1개 + 확정 거래 4건(비고 포함) + 판관비 3건 */
async function main() {
  const email = 'sales17.e2e@askim.local'
  const passwordHash = await bcrypt.hash('askim2026!', 10)
  const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  const userId = ex
    ? (await db.update(users).set({ passwordHash, role: 'sales', team: 'E2E17팀', isTeamLead: false, isActive: true }).where(eq(users.id, ex.id)).returning({ id: users.id }))[0].id
    : (await db.insert(users).values({ name: 'E2E영업17', email, passwordHash, role: 'sales', team: 'E2E17팀' }).returning({ id: users.id }))[0].id
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@askim.local')).limit(1)

  await db.delete(deal).where(like(deal.itemName, 'E2E거래0917%'))
  const base = { accrualYear: 2026, accrualMonth: 9, currency: 'KRW' as const, status: 'confirmed' as const, salesAmountNet: '1000000', salesVat: '100000', salesAmountGross: '1100000', purchaseAmountNet: '700000', purchaseVat: '70000', purchaseAmountGross: '770000' }
  await db.insert(deal).values([
    { ...base, dealCode: 'E2E0917-A', itemName: 'E2E거래0917-A', ownerUserId: userId, createdBy: userId, salesMemo: '매출쪽 메모 A', purchaseMemo: '매입쪽 메모 A' },
    { ...base, dealCode: 'E2E0917-B', itemName: 'E2E거래0917-B', ownerUserId: userId, createdBy: userId },
    { ...base, dealCode: 'E2E0917-C', itemName: 'E2E거래0917-C', ownerUserId: userId, createdBy: userId },
    { ...base, dealCode: 'E2E0917-ADMIN', itemName: 'E2E거래0917-관리자', ownerUserId: admin.id, createdBy: admin.id },
  ])

  await db.delete(expense).where(like(expense.itemName, 'E2E지출0917%'))
  await db.insert(expense).values(
    [1, 2, 3].map((n) => ({ expenseDate: '2026-09-17', itemName: `E2E지출0917-${n}`, amount: String(n * 1000), paymentMethod: 'corporate_card' as const, createdBy: admin.id })),
  )
  console.log('fixture-0917 ready')
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
