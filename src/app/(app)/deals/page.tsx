import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Minus,
  Plus,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { CsvExportButton } from '@/components/csv-export-button'
import { exportDealsCsv } from '@/server/actions/export'
import { DealsTable } from '@/components/deals/deals-table'
import { DealsFilters } from '@/components/deals/deals-filters'
import { DealQuickAdd } from '@/components/deals/deal-quick-add'
import { listDeals } from '@/server/queries/deals'
import { canCreateDeal, canEditDeal, getDealScope, getSessionUser } from '@/server/auth/guards'
import { getAllLookups } from '@/server/queries/lookups'
import { cn } from '@/lib/utils'
import { formatKRW, formatKRWShort } from '@/lib/format'

type SP = { [k: string]: string | string[] | undefined }

const TEXT_COLUMN_FILTERS = [
  'fSales', 'fSalesVat', 'fPurchase', 'fPurchaseVat', 'fProfit',
  'fSalesInvoice', 'fPurchaseInvoice', 'fSalesDate', 'fPurchaseDate',
] as const

/** 금액·날짜·상태 컬럼 검색 파라미터 (2026-09-07 피드백) */
function pickColumnFilters(sp: SP) {
  const out: Partial<Record<(typeof TEXT_COLUMN_FILTERS)[number], string>> & {
    fPaid?: 'paid' | 'unpaid'
    fSettled?: 'settled' | 'unsettled'
  } = {}
  for (const k of TEXT_COLUMN_FILTERS) if (typeof sp[k] === 'string' && sp[k]) out[k] = sp[k]
  if (sp.fPaid === 'paid' || sp.fPaid === 'unpaid') out.fPaid = sp.fPaid
  if (sp.fSettled === 'settled' || sp.fSettled === 'unsettled') out.fSettled = sp.fSettled
  return out
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const filters = {
    q: typeof sp.q === 'string' ? sp.q : undefined,
    fCode: typeof sp.fCode === 'string' ? sp.fCode : undefined,
    fIssuer: typeof sp.fIssuer === 'string' ? sp.fIssuer : undefined,
    fSupplier: typeof sp.fSupplier === 'string' ? sp.fSupplier : undefined,
    ...pickColumnFilters(sp),
    year: sp.year ? parseInt(String(sp.year), 10) : undefined,
    month: sp.month ? parseInt(String(sp.month), 10) : undefined,
    categoryId: sp.categoryId ? parseInt(String(sp.categoryId), 10) : undefined,
    ownerUserIds: typeof sp.owner === 'string' && sp.owner ? sp.owner.split(',').filter(Boolean) : undefined,
    paidStatus: sp.paid as 'unpaid' | 'unsettled' | undefined,
    page: sp.page ? parseInt(String(sp.page), 10) : 1,
  }

  const [{ rows, total, page, pageSize, aggregate, prevAggregate }, lookups, me] =
    await Promise.all([listDeals(filters), getAllLookups(), getSessionUser()])

  // 담당자 필터 옵션도 조회 범위에 맞춤 (팀장=팀원, 팀원=본인)
  const scope = me ? getDealScope(me) : ({ kind: 'all' } as const)
  const filterUsers =
    scope.kind === 'team'
      ? lookups.users.filter((u) => u.team === scope.team)
      : scope.kind === 'own'
        ? lookups.users.filter((u) => u.id === scope.userId)
        : lookups.users

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const margin = aggregate.sales > 0 ? (aggregate.profit / aggregate.sales) * 100 : 0

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">거래</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            매출·매입 통합 거래원장
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton action={exportDealsCsv} filters={filters} />
          {me && canCreateDeal(me.role) && (
            <Link href="/deals/new" className={cn(buttonVariants(), 'gap-1.5')}>
              <Plus className="size-4" />새 거래
            </Link>
          )}
        </div>
      </div>

      <section className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <SummaryCard
          icon={<Database className="size-[15px]" />}
          tone="primary"
          label="매출 합계"
          value={`₩ ${formatKRW(aggregate.sales)}`}
          sub={
            prevAggregate ? (
              <Delta current={aggregate.sales} prev={prevAggregate.sales} />
            ) : (
              <>매출 기준 총액</>
            )
          }
        />
        <SummaryCard
          icon={<ShoppingCart className="size-[15px]" />}
          tone="muted"
          label="매입 합계"
          value={`₩ ${formatKRW(aggregate.purchase)}`}
          sub={
            prevAggregate ? (
              <Delta current={aggregate.purchase} prev={prevAggregate.purchase} />
            ) : (
              <>원가 기준 총액</>
            )
          }
        />
        <SummaryCard
          icon={<TrendingUp className="size-[15px]" />}
          tone="ok"
          label="손익"
          value={`₩ ${formatKRW(aggregate.profit)}`}
          valueClass={aggregate.profit < 0 ? 'text-destructive' : 'text-success-foreground'}
          sub={
            <>
              마진율 <b className="font-medium text-foreground">{margin.toFixed(1)}%</b>
            </>
          }
        />
        <SummaryCard
          icon={<Clock className="size-[15px]" />}
          tone="warn"
          label="미입금"
          value={`${aggregate.unpaidCount.toLocaleString()}건`}
          sub={
            <>
              <span className="font-medium">
                ₩ {formatKRW(aggregate.unpaidAmount)}
              </span>{' '}
              회수 대기
            </>
          }
        />
      </section>

      <section className="mt-5 overflow-clip rounded-2xl border bg-card">
        <div className="border-b p-4">
          <DealsFilters
            categories={lookups.categories}
            users={filterUsers}
            initial={{
              q: filters.q,
              year: filters.year,
              month: filters.month,
              categoryId: filters.categoryId,
              ownerUserIds: filters.ownerUserIds,
              paid: filters.paidStatus,
            }}
          />
        </div>

        <div className="flex items-center gap-3.5 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
          총 <b className="text-foreground">{total.toLocaleString()}</b>건
          <span>·</span>
          매출 <b className="text-foreground">₩{formatKRWShort(aggregate.sales)}</b>
          <span>·</span>
          매입 <b className="text-foreground">₩{formatKRWShort(aggregate.purchase)}</b>
          <span>·</span>
          손익{' '}
          <b className={aggregate.profit < 0 ? 'text-destructive' : 'text-success-foreground'}>
            ₩{formatKRWShort(aggregate.profit)}
          </b>
        </div>

        <DealsTable
          columnFilters={{
            fCode: filters.fCode,
            fIssuer: filters.fIssuer,
            fSupplier: filters.fSupplier,
            ...pickColumnFilters(sp),
          }}
          rows={rows.map((r) => ({
            ...r,
            canTogglePaid:
              me != null &&
              canEditDeal(me, {
                status: r.status as 'draft' | 'confirmed' | 'closed',
                ownerUserId: r.ownerUserId,
              }),
          }))}
        />
        {me && me.role !== 'viewer' && (
          <DealQuickAdd
            categories={lookups.categories}
            users={filterUsers}
            meId={me.id}
            defaultYear={filters.year ?? new Date().getFullYear()}
            defaultMonth={filters.month ?? new Date().getMonth() + 1}
          />
        )}

        <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
          <span>
            {total.toLocaleString()}건 중 {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} 표시
          </span>
          <div className="flex gap-1">
            <PageBtn page={page - 1} filters={sp} disabled={page <= 1}>
              <ChevronLeft className="size-3.5" />
            </PageBtn>
            {pageItems(page, totalPages).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="grid size-7 place-items-center">
                  …
                </span>
              ) : (
                <PageBtn key={p} page={p} filters={sp} active={p === page}>
                  {p}
                </PageBtn>
              ),
            )}
            <PageBtn page={page + 1} filters={sp} disabled={page >= totalPages}>
              <ChevronRight className="size-3.5" />
            </PageBtn>
          </div>
        </div>
      </section>
    </div>
  )
}

const TONE = {
  primary: 'bg-background text-foreground',
  muted: 'bg-background text-muted-foreground',
  ok: 'bg-background text-success-foreground',
  warn: 'bg-background text-accent-foreground',
} as const

function SummaryCard({
  icon,
  tone,
  label,
  value,
  valueClass,
  sub,
}: {
  icon: React.ReactNode
  tone: keyof typeof TONE
  label: string
  value: string
  valueClass?: string
  sub: React.ReactNode
}) {
  const warn = tone === 'warn'
  return (
    <div className={cn('rounded-lg px-5 py-4', warn ? 'bg-accent' : 'bg-muted')}>
      <div
        className={cn(
          'flex items-center gap-2.5 text-[11px] font-medium tracking-[0.04em]',
          warn ? 'text-accent-foreground' : 'text-muted-foreground',
        )}
      >
        <span className={cn('grid size-[26px] place-items-center rounded-full', TONE[tone])}>
          {icon}
        </span>
        {label}
      </div>
      <div
        className={cn(
          'mt-2.5 text-[24px] font-normal leading-tight tabular-nums',
          warn && 'text-accent-foreground',
          valueClass,
        )}
      >
        {value}
      </div>
      <div className={cn('mt-1.5 text-xs', warn ? 'text-accent-foreground' : 'text-subtle-foreground')}>
        {sub}
      </div>
    </div>
  )
}

function Delta({ current, prev }: { current: number; prev: number }) {
  if (prev <= 0) {
    return (
      <>
        전월 대비{' '}
        <span className="font-medium text-foreground">
          {current > 0 ? '신규' : '—'}
        </span>
      </>
    )
  }
  const pct = ((current - prev) / prev) * 100
  const flat = Math.abs(pct) < 0.05
  const up = pct > 0
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  const color = flat
    ? 'text-muted-foreground'
    : up
      ? 'text-success-foreground'
      : 'text-destructive'
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex items-center gap-0.5 font-medium', color)}>
        <Icon className="size-3" />
        {Math.abs(pct).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">전월 대비</span>
    </span>
  )
}

function pageItems(page: number, total: number): (number | 'gap')[] {
  const set = new Set([1, total, page, page - 1, page + 1])
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const n of nums) {
    if (n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}

function PageBtn({
  page,
  filters,
  children,
  active,
  disabled,
}: {
  page: number
  filters: SP
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
}) {
  const base = 'grid size-7 place-items-center rounded-md border bg-card text-xs'
  if (disabled) {
    return (
      <span className={cn(base, 'text-muted-foreground/40')}>{children}</span>
    )
  }
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (k === 'page') continue
    if (typeof v === 'string' && v) qs.set(k, v)
  }
  qs.set('page', String(page))
  return (
    <Link
      href={`/deals?${qs.toString()}`}
      className={cn(
        base,
        'transition-colors hover:bg-accent',
        active && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
      )}
    >
      {children}
    </Link>
  )
}
