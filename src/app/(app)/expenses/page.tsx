import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { expense, expenseCategory } from '@/lib/db/schema'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatKRW } from '@/lib/format'

export default async function ExpensesPage() {
  const where = isNull(expense.deletedAt)

  const [rows, [{ total }], [aggr]] = await Promise.all([
    db
      .select({
        id: expense.id,
        date: expense.expenseDate,
        itemName: expense.itemName,
        amount: expense.amount,
        counterpartyText: expense.counterpartyText,
        paymentMethod: expense.paymentMethod,
        category: expenseCategory.nameKo,
      })
      .from(expense)
      .leftJoin(expenseCategory, eq(expenseCategory.id, expense.expenseCategoryId))
      .where(where)
      .orderBy(desc(expense.expenseDate), desc(expense.createdAt))
      .limit(100),
    db.select({ total: sql<number>`count(*)::int` }).from(expense).where(where),
    db
      .select({ s: sql<string>`coalesce(sum(amount),0)::text` })
      .from(expense)
      .where(where),
  ])

  return (
    <div>
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">판관비</h1>
        <p className="text-sm text-zinc-500">법인카드·개인카드·현금 지출</p>
      </div>
      <div className="border-b bg-zinc-50 px-6 py-2 text-sm text-zinc-600">
        총 <b>{total.toLocaleString()}</b>건 · 합계{' '}
        <b className="font-mono">{formatKRW(aggr.s)}</b>
        {rows.length < total && <span className="ml-2">(최근 100건만 표시)</span>}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>지출일</TableHead>
            <TableHead>품목</TableHead>
            <TableHead>거래처</TableHead>
            <TableHead>항목</TableHead>
            <TableHead>수단</TableHead>
            <TableHead className="text-right">금액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{r.date}</TableCell>
              <TableCell className="text-xs">{r.itemName ?? '-'}</TableCell>
              <TableCell className="text-xs">{r.counterpartyText ?? '-'}</TableCell>
              <TableCell className="text-xs">{r.category ?? '-'}</TableCell>
              <TableCell className="text-xs">
                {r.paymentMethod === 'corporate_card' ? '법인카드' : r.paymentMethod === 'personal_card' ? '개인카드' : r.paymentMethod === 'cash' ? '현금' : '이체'}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatKRW(r.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
