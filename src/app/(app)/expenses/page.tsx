import Link from 'next/link'
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { Plus, Receipt, Upload, Wallet } from 'lucide-react'
import { db } from '@/lib/db/client'
import { expense, expenseCategory } from '@/lib/db/schema'
import { buttonVariants } from '@/components/ui/button'
import { CsvExportButton } from '@/components/csv-export-button'
import { exportExpensesCsv } from '@/server/actions/export'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ExpensesFilters } from '@/components/expenses/expenses-filters'
import { ExpenseRowActions } from '@/components/expenses/expense-row-actions'
import { getAllLookups } from '@/server/queries/lookups'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'
import { requireBackoffice } from '@/server/auth/require-backoffice'
import { canCreateExpense, canDeleteExpense, canEditExpense } from '@/server/auth/guards'

const PAYMENT_LABEL: Record<string, string> = {
  corporate_card: '법인카드',
  personal_card: '개인카드',
  cash: '현금',
}

type SP = {
  q?: string
  year?: string
  month?: string
  categoryId?: string
  method?: string
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const me = await requireBackoffice()

  const sp = await searchParams
  const filters = {
    q: typeof sp.q === 'string' ? sp.q : undefined,
    year: sp.year ? parseInt(sp.year, 10) : undefined,
    month: sp.month ? parseInt(sp.month, 10) : undefined,
    categoryId: sp.categoryId ? parseInt(sp.categoryId, 10) : undefined,
    method: typeof sp.method === 'string' ? sp.method : undefined,
  }

  const conds = [isNull(expense.deletedAt)]
  if (filters.year) conds.push(eq(expense.year, filters.year))
  if (filters.month) conds.push(eq(expense.month, filters.month))
  if (filters.categoryId)
    conds.push(eq(expense.expenseCategoryId, filters.categoryId))
  if (filters.method)
    conds.push(eq(expense.paymentMethod, filters.method as 'corporate_card'))
  if (filters.q) {
    const like = `%${filters.q}%`
    conds.push(
      or(ilike(expense.itemName, like), ilike(expense.counterpartyText, like))!,
    )
  }
  const where = and(...conds)

  const [rows, [{ total }], [aggr], lookups] = await Promise.all([
    db
      .select({
        id: expense.id,
        date: expense.expenseDate,
        itemName: expense.itemName,
        amount: expense.amount,
        counterpartyText: expense.counterpartyText,
        paymentMethod: expense.paymentMethod,
        expenseCategoryId: expense.expenseCategoryId,
        category: expenseCategory.nameKo,
        createdBy: expense.createdBy,
        payerUserId: expense.payerUserId,
        createdAt: expense.createdAt,
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
    getAllLookups(),
  ])

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">판관비</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            법인카드·개인카드·현금 지출
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton action={exportExpensesCsv} filters={filters} />
          {me && canCreateExpense(me.role) && (
            <>
              <Link href="/expenses/upload" className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5')}>
                <Upload className="size-4" />엑셀 업로드
              </Link>
              <Link href="/expenses/new" className={cn(buttonVariants(), 'gap-1.5')}>
                <Plus className="size-4" />판관비 입력
              </Link>
            </>
          )}
        </div>
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

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-4">
          <ExpensesFilters
            categories={lookups.expenseCategories}
            initial={{
              q: filters.q,
              year: filters.year,
              month: filters.month,
              categoryId: filters.categoryId,
              method: filters.method,
            }}
          />
        </div>

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
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/60">
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.date}
                  </TableCell>
                  <TableCell className="text-xs">{r.itemName ?? '-'}</TableCell>
                  <TableCell className="text-xs">
                    {r.counterpartyText ?? '-'}
                  </TableCell>
                  <TableCell>
                    {r.category ? (
                      <span className="inline-flex h-[22px] items-center rounded-full bg-info px-2.5 text-[12px] text-info-foreground">
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
                  <TableCell className="py-1">
                    <ExpenseRowActions
                      row={{
                        id: r.id,
                        date: r.date,
                        itemName: r.itemName,
                        counterpartyText: r.counterpartyText,
                        amount: r.amount,
                        expenseCategoryId: r.expenseCategoryId,
                        paymentMethod: r.paymentMethod,
                      }}
                      categories={lookups.expenseCategories}
                      canEdit={me != null && canEditExpense(me, r)}
                      canDelete={me != null && canDeleteExpense(me, r)}
                    />
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
  primary: 'bg-background text-foreground',
  muted: 'bg-muted text-muted-foreground',
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
    <div className="rounded-2xl border bg-card p-4">
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
      <div className="mt-3 text-[23px] font-medium tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  )
}
