import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal, dealCategory, users } from '@/lib/db/schema'

function num(v: string | null) {
  return parseFloat(v ?? '0') || 0
}

export async function getDashboard() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const today = now.toISOString().slice(0, 10)

  const notDeleted = isNull(deal.deletedAt)

  const sums = {
    sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
    purchase: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
    profit: sql<string>`coalesce(sum(${deal.profit}), 0)::text`,
  }

  const [[monthAggr], [yearAggr], [overdueIn], [overdueOut], recent] =
    await Promise.all([
      db
        .select(sums)
        .from(deal)
        .where(
          and(
            notDeleted,
            eq(deal.accrualYear, year),
            eq(deal.accrualMonth, month),
          ),
        ),
      db
        .select(sums)
        .from(deal)
        .where(and(notDeleted, eq(deal.accrualYear, year))),
      // 미입금(예정일 지남)
      db
        .select({
          count: sql<number>`count(*)::int`,
          amount: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
        })
        .from(deal)
        .where(
          and(
            notDeleted,
            eq(deal.salesPaidStatus, 'pending'),
            lt(deal.salesDueDate, today),
          ),
        ),
      // 미결산(예정일 지남)
      db
        .select({
          count: sql<number>`count(*)::int`,
          amount: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
        })
        .from(deal)
        .where(
          and(
            notDeleted,
            eq(deal.purchasePaidStatus, 'pending'),
            lt(deal.purchaseDueDate, today),
          ),
        ),
      // 최근 거래
      db
        .select({
          id: deal.id,
          dealCode: deal.dealCode,
          itemName: deal.itemName,
          profit: deal.profit,
          ownerName: users.name,
          categoryName: dealCategory.nameKo,
        })
        .from(deal)
        .leftJoin(users, eq(users.id, deal.ownerUserId))
        .leftJoin(dealCategory, eq(dealCategory.id, deal.categoryId))
        .where(notDeleted)
        .orderBy(desc(deal.createdAt))
        .limit(10),
    ])

  const monthSales = num(monthAggr.sales)
  const monthProfit = num(monthAggr.profit)

  return {
    period: { year, month },
    thisMonth: {
      sales: monthSales,
      purchase: num(monthAggr.purchase),
      profit: monthProfit,
      margin: monthSales > 0 ? (monthProfit / monthSales) * 100 : 0,
    },
    yearToDate: {
      sales: num(yearAggr.sales),
      profit: num(yearAggr.profit),
    },
    overdueReceivable: { count: overdueIn.count, amount: num(overdueIn.amount) },
    overduePayable: { count: overdueOut.count, amount: num(overdueOut.amount) },
    recent,
  }
}
