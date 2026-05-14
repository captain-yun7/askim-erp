import './_env'
import bcrypt from 'bcryptjs'
import { db } from '../src/lib/db/client'
import { users } from '../src/lib/db/schema'

// 임시 비밀번호 — 운영 전에 각자 변경 필수
const TEMP_PASSWORD = 'askim2026!'

const USERS = [
  // 영업팀 — deal_code_prefix 매핑은 _docs/specs/03_domain_rules.md 참조
  { name: '김형준',  email: 'kim.hj@askim.local',    role: 'sales',      dealCodePrefix: 'AZ', team: '국내영업' },
  { name: '최현정',  email: 'choi.hj@askim.local',   role: 'sales',      dealCodePrefix: 'AC', team: '국내영업' },
  { name: '이유정',  email: 'lee.yj@askim.local',    role: 'sales',      dealCodePrefix: 'AY', team: '국내영업' },
  { name: '박지운',  email: 'park.jw@askim.local',   role: 'sales',      dealCodePrefix: 'AW', team: '국내영업' },
  { name: '강지호',  email: 'kang.jh@askim.local',   role: 'sales',      dealCodePrefix: 'AH', team: '국내영업' },
  { name: '오혁',    email: 'oh.h@askim.local',      role: 'sales',      dealCodePrefix: 'AO', team: '국내영업' },
  { name: '유찬영',  email: 'yu.cy@askim.local',     role: 'sales',      dealCodePrefix: 'AU', team: '국내영업' },
  { name: '이명철',  email: 'lee.mc@askim.local',    role: 'sales',      dealCodePrefix: 'AM', team: '국내영업' },
  { name: '이나린',  email: 'lee.nr@askim.local',    role: 'sales',      dealCodePrefix: 'AN', team: '콘텐츠팀' },
  { name: '윤도경',  email: 'yoon.dk@askim.local',   role: 'sales',      dealCodePrefix: null, team: '국내영업' },
  { name: '김해준',  email: 'kim.hj.foreign@askim.local', role: 'sales', dealCodePrefix: 'FJ', team: '해외영업' },
  // 팀 그룹 계정 (거래 import 시 매칭용 — 사람이 아닌 라벨)
  { name: '해외영업팀', email: 'overseas.team@askim.local', role: 'sales', dealCodePrefix: 'AD', team: '해외영업' },
  { name: '중국사업부', email: 'china.team@askim.local',    role: 'sales', dealCodePrefix: 'CN', team: '중국사업부' },
  // 시스템
  { name: '관리자', email: 'admin@askim.local', role: 'admin', dealCodePrefix: null, team: '본부' },
] as const

async function main() {
  console.log('🌱 Seeding users...')
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10)
  const rows = USERS.map((u) => ({ ...u, passwordHash: hash }))
  await db.insert(users).values(rows).onConflictDoNothing()
  console.log(`✓ users: ${USERS.length}`)
  console.log(`  임시 비밀번호: ${TEMP_PASSWORD}  (운영 전 변경 필수)`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
