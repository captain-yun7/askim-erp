import Link from 'next/link'
import { RememberList } from '@/components/list-return'
import { desc, eq, sql } from 'drizzle-orm'
import { Plus, Receipt, Upload, Wallet } from 'lucide-react'
import { db } from '@/lib/db/client'
import { expense, expenseCategory } from '@/lib/db/schema'
import { buttonVariants } from '@/components/ui/button'
import { XlsxExportButton } from '@/components/xlsx-export-button'
import { exportExpensesXlsx } from '@/server/actions/export'
import { expenseListWhere } from '@/server/queries/expenses'
import { compactText } from '@/lib/text-search'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ExpensesFilters } from '@/components/expenses/expenses-filters'
import { ExpensesBulkBar } from '@/components/expenses/expenses-bulk-bar'
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

  const where = await expenseListWhere(filters)
  // 월·항목·검색으로 좁혔으면 전부 보여 준다 (100건에서 잘려 월초 내역이 안 보인다는 2026-09-28 문의)
  const narrowed = Boolean(filters.month || filters.categoryId || (filters.q && compactText(filters.q)))
  const limit = narrowed ? 5000 : 100

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
      .orderBy(desc(expense.expenseDate), desc(expense.createdAt), desc(expense.id))
      .limit(limit),
    db.select({ total: sql<number>`count(*)::int` }).from(expense).where(where),
    db
      .select({ s: sql<string>`coalesce(sum(amount),0)::text` })
      .from(expense)
      .where(where),
    getAllLookups(),
  ])

  const anyDeletable = me != null && rows.some((r) => canDeleteExpense(me, r))

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
          <XlsxExportButton action={exportExpensesXlsx} filters={filters} label="엑셀 내보내기" />
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
          sub={rows.length < total ? `최근 ${rows.length.toLocaleString()}건만 표시 · 월이나 항목을 고르면 전체 표시` : '전체 표시'}
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-4">
          <RememberList path="/expenses" />
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
          총 <b data-slot="expenses-total" className="text-foreground">{total.toLocaleString()}</b>건
          <span>·</span>
          합계 <b className="text-foreground">₩{formatKRW(aggr.s)}</b>
          {rows.length < total && (
            <span data-slot="expenses-truncated" className="text-destructive">
              아래 목록은 최근 {rows.length.toLocaleString()}건입니다. 월이나 항목을 고르면 전체가 보입니다 (합계는 전체 기준)
            </span>
          )}
        </div>

        <div id="expenses-table">
        {anyDeletable && <ExpensesBulkBar containerId="expenses-table" />}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {anyDeletable && (
                  <TableHead className="w-10 pl-4">
                    <input type="checkbox" data-select-all aria-label="전체 선택" className="size-3.5 accent-[var(--primary)]" />
                  </TableHead>
                )}
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
                  {anyDeletable && (
                    <TableCell className="pl-4">
                      {me != null && canDeleteExpense(me, r) && (
                        <input type="checkbox" data-row-select data-id={r.id} aria-label={`${r.date} ${r.itemName ?? ''} 선택`} className="size-3.5 accent-[var(--primary)]" />
                      )}
                    </TableCell>
                  )}
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
