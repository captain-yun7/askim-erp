import './_env'
import { eq, inArray, like } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { appSetting, counterparty, deal, users } from '@/lib/db/schema'

/**
 * 2026-09-16 피드백 e2e 픽스처
 *   - 팀장/팀원/타팀 계정 + 각자 거래 1건씩 (팀장 조회 범위 설정 검증)
 *   - 거래코드 자연 정렬용 거래 4건 (E2ESORT-1, -2, -10, -11)
 *   - 다건 삭제용 거래처 2건
 */
const PASSWORD = 'askim2026!'
const USERS = [
  { key: 'lead', name: 'E2E팀장', email: 'lead.e2e@askim.local', team: 'E2E팀', isTeamLead: true },
  { key: 'member', name: 'E2E팀원', email: 'member.e2e@askim.local', team: 'E2E팀', isTeamLead: false },
  { key: 'other', name: 'E2E타팀', email: 'other.e2e@askim.local', team: 'E2E타팀', isTeamLead: false },
] as const

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const ids: Record<string, string> = {}
  for (const u of USERS) {
    const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1)
    if (ex) {
      await db.update(users).set({ passwordHash, role: 'sales', team: u.team, isTeamLead: u.isTeamLead, isActive: true, name: u.name }).where(eq(users.id, ex.id))
      ids[u.key] = ex.id
    } else {
      const [row] = await db.insert(users).values({ name: u.name, email: u.email, passwordHash, role: 'sales', team: u.team, isTeamLead: u.isTeamLead }).returning({ id: users.id })
      ids[u.key] = row.id
    }
  }

  await db.delete(deal).where(like(deal.itemName, 'E2E거래0916%'))
  const base = { accrualYear: 2026, accrualMonth: 9, currency: 'KRW' as const, status: 'confirmed' as const, salesAmountNet: '1000000', salesVat: '100000', salesAmountGross: '1100000' }
  await db.insert(deal).values([
    { ...base, dealCode: 'E2E0916-LEAD', itemName: 'E2E거래0916-팀장', ownerUserId: ids.lead, createdBy: ids.lead },
    { ...base, dealCode: 'E2E0916-MEMBER', itemName: 'E2E거래0916-팀원', ownerUserId: ids.member, createdBy: ids.member },
    { ...base, dealCode: 'E2E0916-OTHER', itemName: 'E2E거래0916-타팀', ownerUserId: ids.other, createdBy: ids.other },
    ...['1', '2', '10', '11'].map((n) => ({ ...base, dealCode: `E2ESORT-${n}`, itemName: 'E2E거래0916-정렬', ownerUserId: ids.other, createdBy: ids.other })),
    { ...base, dealCode: 'E2ESORT', itemName: 'E2E거래0916-정렬', ownerUserId: ids.other, createdBy: ids.other },
  ])

  await db.delete(counterparty).where(like(counterparty.name, 'E2E거래처0916%'))
  await db.insert(counterparty).values([
    { name: 'E2E거래처0916-A', roleTags: ['media'] },
    { name: 'E2E거래처0916-B', roleTags: ['advertiser'] },
    { name: 'E2E거래처0916-단건', roleTags: [] },
  ])
  await db.delete(appSetting).where(inArray(appSetting.key, ['team_lead_scope']))
  console.log('fixture-0916 ready')
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
