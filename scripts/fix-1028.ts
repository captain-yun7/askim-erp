import './_env'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deposit, exclusiveContract, users } from '@/lib/db/schema'

/**
 * 2026-10-28 요청 데이터 정리
 *   - 보증금 상태 미반환·상계예정 → 보유 (상태는 보유·반환완료만)
 *   - 보유자산 구분 삭제 → 남은 보유자산 지우기(삭제 표시)
 *   - 사용자 이름 '김도형(AH)' → '김도형' (거래코드 앞자리를 이름에 붙여 넣었던 것)
 *   DRY_RUN=1 npx tsx scripts/fix-1028.ts   (먼저 확인)
 */
const DRY = process.env.DRY_RUN === '1'

async function main() {
  const deps = await db.select({ id: deposit.id, name: deposit.counterpartyName, status: deposit.status }).from(deposit)
    .where(and(inArray(deposit.status, ['unreturned', 'offset']), isNull(deposit.deletedAt)))
  const assets = await db.select({ id: exclusiveContract.id, name: exclusiveContract.mediaName }).from(exclusiveContract)
    .where(and(eq(exclusiveContract.kind, 'asset'), isNull(exclusiveContract.deletedAt)))
  const named = await db.select({ id: users.id }).from(users).where(eq(users.name, '김도형(AH)'))
  console.log(`보증금 → 보유 ${deps.length}건:`, deps.map((d) => `${d.name}(${d.status})`).join(', '))
  console.log(`보유자산 삭제 ${assets.length}건:`, assets.map((a) => a.name).join(', '))
  console.log(`이름 고침 ${named.length}건: 김도형(AH) → 김도형`)
  if (DRY) return process.exit(0)
  if (deps.length) await db.update(deposit).set({ status: 'held' }).where(inArray(deposit.id, deps.map((d) => d.id)))
  if (assets.length) await db.update(exclusiveContract).set({ deletedAt: new Date() }).where(inArray(exclusiveContract.id, assets.map((a) => a.id)))
  if (named.length) await db.update(users).set({ name: '김도형' }).where(inArray(users.id, named.map((u) => u.id)))
  console.log('완료')
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
