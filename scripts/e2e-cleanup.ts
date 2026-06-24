import './_env'
import { like } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty, deal, expense } from '@/lib/db/schema'

async function main() {
  const d = await db.delete(deal).where(like(deal.itemName, 'E2E거래%')).returning({ id: deal.id })
  const e = await db.delete(expense).where(like(expense.itemName, 'E2E지출%')).returning({ id: expense.id })
  const c = await db.delete(counterparty).where(like(counterparty.name, 'E2E거래처%')).returning({ id: counterparty.id })
  console.log(`cleanup: deal ${d.length}건, expense ${e.length}건, counterparty ${c.length}건 삭제`)
  process.exit(0)
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
