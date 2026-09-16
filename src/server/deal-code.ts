import { eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db/client'
import { deal, users } from '@/lib/db/schema'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * 거래코드 자동 채번: [prefix][YYMMDD][-N]
 *
 * 한 계정을 여러 명이 공유(팀 계정)하면 같은 base 로 동시에 등록이 들어온다.
 * base 단위 advisory lock 으로 채번~INSERT 를 직렬화하고, 개수가 아니라
 * 기존 최대 번호를 기준으로 다음 번호를 잡는다(삭제된 코드도 UNIQUE 를 점유하므로).
 */
export async function autoNumberDealCode(tx: Tx, ownerId: string | null | undefined): Promise<string> {
  let prefix = 'XX'
  if (ownerId) {
    const [u] = await tx
      .select({ p: users.dealCodePrefix })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1)
    if (u?.p) prefix = u.p
  }
  const now = new Date()
  const yymmdd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const base = `${prefix}${yymmdd}`

  // 같은 base 를 쓰는 동시 등록을 트랜잭션 종료까지 직렬화
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${base}))`)

  const [{ n }] = await tx
    .select({
      n: sql<number>`coalesce(max(case when ${deal.dealCode} = ${base} then 1 else nullif(regexp_replace(${deal.dealCode}, '^.*-', ''), '')::int end), 0)`,
    })
    .from(deal)
    .where(sql`${deal.dealCodeBase} = ${base}`)
  if (n === 0) return base
  return `${base}-${n + 1}`
}
