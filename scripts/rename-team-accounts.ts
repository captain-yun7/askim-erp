import './_env'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

/**
 * 팀 계정 로그인 정보 전환 (2026-09-16 고객 요청)
 *
 * 거래 import 매칭용 라벨로 만들었던 팀 계정을 실제 로그인 계정으로 전환한다.
 * 새 계정을 만들지 않는 이유: deal_code_prefix(AD/CN)가 UNIQUE 라 재사용이 안 되고,
 * 기존 거래가 이 계정에 묶여 있어 분리하면 팀 실적이 쪼개진다.
 *
 * 실행: DATABASE_URL='<운영 URL>' npx tsx scripts/rename-team-accounts.ts
 *       (--apply 없이 실행하면 변경 없이 대상만 출력)
 */
const TARGETS = [
  { from: 'overseas.team@askim.local', to: 'globalsales@askim.kr' },
  { from: 'china.team@askim.local', to: 'fanbiz@askim.kr' },
]
const PASSWORD = 'askim2026!'

async function main() {
  const apply = process.argv.includes('--apply')
  const host = new URL(process.env.DATABASE_URL!).host
  console.log(`DB: ${host}  |  모드: ${apply ? '실제 반영' : '미리보기 (--apply 없음)'}\n`)

  const hash = await bcrypt.hash(PASSWORD, 10)

  for (const t of TARGETS) {
    const [u] = await db
      .select({ id: users.id, name: users.name, email: users.email, prefix: users.dealCodePrefix, active: users.isActive })
      .from(users)
      .where(eq(users.email, t.from))
      .limit(1)

    if (!u) {
      console.log(`✗ ${t.from} — 없음, 건너뜀`)
      continue
    }
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, t.to)).limit(1)
    if (taken && taken.id !== u.id) {
      console.log(`✗ ${t.to} — 이미 다른 계정이 사용 중, 건너뜀`)
      continue
    }

    console.log(`${apply ? '→' : '·'} ${u.name} (${u.email} → ${t.to}, 접두사 ${u.prefix ?? '-'}, 활성 ${u.active})`)
    if (apply) {
      await db.update(users).set({ email: t.to, passwordHash: hash, isActive: true }).where(eq(users.id, u.id))
    }
  }

  console.log(`\n비밀번호: ${PASSWORD}`)
  if (!apply) console.log('실제로 반영하려면 --apply 를 붙여 다시 실행하세요.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
