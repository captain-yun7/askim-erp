import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  account,
  dealCategory,
  expenseCategory,
  salesMethod,
  users,
} from '@/lib/db/schema'

export async function getAllLookups() {
  const [cats, accs, sms, expCats, us] = await Promise.all([
    db.select().from(dealCategory).orderBy(asc(dealCategory.displayOrder)),
    db.select().from(account).orderBy(asc(account.displayOrder)),
    db.select().from(salesMethod).orderBy(asc(salesMethod.displayOrder)),
    db.select().from(expenseCategory).orderBy(asc(expenseCategory.displayOrder)),
    db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        team: users.team,
        dealCodePrefix: users.dealCodePrefix,
      })
      .from(users)
      .orderBy(asc(users.name)),
  ])
  return {
    categories: cats,
    accounts: accs,
    salesMethods: sms,
    expenseCategories: expCats,
    users: us,
  }
}
