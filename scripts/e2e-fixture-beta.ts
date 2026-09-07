import './_env'
import { eq, like } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { expense, users } from '@/lib/db/schema'

// E2E 베타 권한 테스트 픽스처: viewer 계정 + 회계가 입력한 판관비 1건
export const E2E_VIEWER = { email: 'viewer.e2e@askim.local', password: 'askim2026!' }

async function main() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, E2E_VIEWER.email)).limit(1)
  const passwordHash = await bcrypt.hash(E2E_VIEWER.password, 10)
  if (existing) {
    await db.update(users).set({ passwordHash, role: 'viewer', isActive: true }).where(eq(users.id, existing.id))
  } else {
    await db.insert(users).values({ name: 'E2E조회', email: E2E_VIEWER.email, passwordHash, role: 'viewer', team: null })
  }

  await db.delete(expense).where(like(expense.itemName, 'E2E지출BETA%'))
  const [acct] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'accountant@askim.local')).limit(1)
  const [row] = await db
    .insert(expense)
    .values({
      expenseDate: '2026-09-01',
      itemName: 'E2E지출BETA',
      amount: '12345',
      paymentMethod: 'corporate_card',
      payerUserId: acct.id,
      createdBy: acct.id,
    })
    .returning({ id: expense.id })
  console.log(`EXPENSE_ID=${row.id}`)
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
