import './_env'
import { eq, like, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSetting, attachment, counterparty, deal, deposit, expense, users } from '@/lib/db/schema'

async function main() {
  const d = await db.delete(deal).where(like(deal.itemName, 'E2E거래%')).returning({ id: deal.id })
  const e = await db.delete(expense).where(like(expense.itemName, 'E2E%')).returning({ id: expense.id })
  const c = await db.delete(counterparty).where(like(counterparty.name, 'E2E거래처%')).returning({ id: counterparty.id })
  const dep = await db.delete(deposit).where(like(deposit.counterpartyName, 'E2E거래처%')).returning({ id: deposit.id })
  await db.delete(attachment).where(like(attachment.filename, 'sample.pdf'))
  // *.e2e@askim.local = e2e 전용 계정 (조회 전용·팀장·팀원·타팀)
  const u = await db.delete(users).where(or(eq(users.email, 'viewer.e2e@askim.local'), like(users.email, '%.e2e@askim.local'))).returning({ id: users.id })
  // 팀장 조회 범위는 기본값(전체)으로 되돌림
  await db.delete(appSetting).where(eq(appSetting.key, 'team_lead_scope'))
  console.log(`cleanup: deal ${d.length}건, expense ${e.length}건, counterparty ${c.length}건, e2e user ${u.length}건, deposit ${dep.length}건 삭제`)
  process.exit(0)
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
