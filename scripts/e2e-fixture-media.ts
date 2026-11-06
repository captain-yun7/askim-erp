import './_env'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

/** 매체관리 e2e — 조회 전용 계정 (e2e-cleanup 이 지운다) */
async function main() {
  const email = 'viewer.e2e@askim.local'
  const passwordHash = await bcrypt.hash('askim2026!', 10)
  const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (ex) await db.update(users).set({ passwordHash, role: 'viewer', isActive: true }).where(eq(users.id, ex.id))
  else await db.insert(users).values({ name: 'E2E조회', email, passwordHash, role: 'viewer' })
  console.log('fixture-media ready')
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
