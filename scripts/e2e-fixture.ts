import './_env'
import { eq, like } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty, users } from '@/lib/db/schema'

// E2E 권한 테스트용 거래처 픽스처 생성
// createdBy = 영업(kim.hj) → 본인 소유이므로 일반필드 수정은 가능, 민감필드만 차단되는 케이스 검증용
async function main() {
  await db.delete(counterparty).where(like(counterparty.name, 'E2E거래처%'))
  const [sales] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'kim.hj@askim.local'))
    .limit(1)
  const [row] = await db
    .insert(counterparty)
    .values({
      name: 'E2E거래처FIXTURE',
      businessNo: '111-11-11111',
      roleTags: ['media'],
      createdBy: sales.id,
    })
    .returning({ id: counterparty.id })
  console.log(`FIXTURE_ID=${row.id}`)
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
