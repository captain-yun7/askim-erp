import { desc, eq, isNull, sql } from 'drizzle-orm'
import { Receipt, Wallet } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'

const PAYMENT_LABEL: Record<string, string> = {
  corporate_card: '법인카드',
  personal_card: '개인카드',
  cash: '현금',
}

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
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">판관비</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          법인카드·개인카드·현금 지출
        </p>
      </div>

      <section className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <SummaryCard
          icon={<Wallet className="size-[15px]" />}
          tone="primary"
          label="총 지출액"
          value={`₩ ${formatKRW(aggr.s)}`}
          sub="전체 지출 합계"
        />
        <SummaryCard
          icon={<Receipt className="size-[15px]" />}
          tone="muted"
          label="지출 건수"
          value={`${total.toLocaleString()}건`}
          sub={rows.length < total ? '최근 100건만 표시' : '전체 표시'}
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-3.5 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
          총 <b className="text-foreground">{total.toLocaleString()}</b>건
          <span>·</span>
          합계 <b className="text-foreground">₩{formatKRW(aggr.s)}</b>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
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
                <TableRow key={r.id} className="hover:bg-accent/40">
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.date}
                  </TableCell>
                  <TableCell className="text-xs">{r.itemName ?? '-'}</TableCell>
                  <TableCell className="text-xs">
                    {r.counterpartyText ?? '-'}
                  </TableCell>
                  <TableCell>
                    {r.category ? (
                      <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {r.category}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {PAYMENT_LABEL[r.paymentMethod] ?? '이체'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {formatKRW(r.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}

const TONE = {
  primary: 'bg-accent text-primary',
  muted: 'bg-zinc-100 text-zinc-500',
} as const

function SummaryCard({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  tone: keyof typeof TONE
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
        <span
          className={cn(
            'grid size-[26px] place-items-center rounded-md border border-current/40',
            TONE[tone],
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-[23px] font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  )
}
