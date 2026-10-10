import Link from 'next/link'
import { RememberList } from '@/components/list-return'
import {
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
import { CollapseOnTableScroll } from '@/components/deals/collapse-on-table-scroll'
import { listDeals, listOverdueSalesDue } from '@/server/queries/deals'
import { OverdueNotice } from '@/components/deals/overdue-notice'
import { DEAL_SORT_LABEL, type DealSort } from '@/lib/deal-sort'
import { canCreateDeal, canDeleteDeal, canViewCommission, getSessionUser } from '@/server/auth/guards'
import { canEditDealShared, getShareTeams, resolveDealScope } from '@/server/auth/deal-scope'
import { getAllLookups } from '@/server/queries/lookups'
import { cn } from '@/lib/utils'
import { formatKRW, formatKRWShort } from '@/lib/format'

type SP = { [k: string]: string | string[] | undefined }

const TEXT_COLUMN_FILTERS = [
  'fItem', 'fSales', 'fSalesVat', 'fSalesGross', 'fPurchase', 'fPurchaseVat', 'fPurchaseGross', 'fProfit',
  'fSalesInvoice', 'fPurchaseInvoice', 'fSalesDue', 'fSalesPaid', 'fPurchaseDue', 'fPurchasePaid',
] as const

const intList = (v: string | string[] | undefined) => {
  if (typeof v !== 'string' || !v) return undefined
  const out = v.split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n))
  return out.length ? out : undefined
}

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
    // 귀속연도 다중 선택 (2026-09-16 피드백) — 하나만 고르면 전월 대비·행 추가 기본값에 쓰도록 year 도 채움
    years: intList(sp.year),
    year: intList(sp.year)?.length === 1 ? intList(sp.year)![0] : undefined,
    // 월·상품구분·상태 다중 선택 (2026-09-09 피드백) — 쉼표 구분
    months: intList(sp.month),
    categoryIds: intList(sp.categoryId),
    ownerUserIds: typeof sp.owner === 'string' && sp.owner ? sp.owner.split(',').filter(Boolean) : undefined,
    paidStatuses: typeof sp.paid === 'string' && sp.paid ? (sp.paid.split(',').filter((v): v is 'unpaid' | 'unsettled' => v === 'unpaid' || v === 'unsettled')) : undefined,
    changedOnly: sp.changed === '1',
    reviewStatuses: typeof sp.review === 'string' && sp.review ? sp.review.split(',').filter((v): v is 'requested' | 'done' => v === 'requested' || v === 'done') : undefined,
    // 50건 페이지 대신 전체 세로 스크롤 (2026-09-09 피드백) — 상한 5,000
    page: 1,
    pageSize: 5000,
    sort: (typeof sp.sort === 'string' && sp.sort in DEAL_SORT_LABEL ? sp.sort : 'created') as DealSort,
    dir: (sp.dir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
  }

  const [{ rows, total, aggregate, prevAggregate }, lookups, me, overdue] =
    await Promise.all([listDeals(filters), getAllLookups(), getSessionUser(), listOverdueSalesDue()])

  // 담당자 필터 옵션도 조회 범위에 맞춤 (팀장=팀원, 팀원=본인)
  const scope = me ? await resolveDealScope(me) : ({ kind: 'all' } as const)
  const shareTeams = me ? await getShareTeams(me) : []
  const filterUsers =
    scope.kind === 'team'
      ? lookups.users.filter((u) => u.team != null && scope.teams.includes(u.team))
      : scope.kind === 'own'
        ? lookups.users.filter((u) => u.id === scope.userId)
        : lookups.users

  const margin = aggregate.sales > 0 ? (aggregate.profit / aggregate.sales) * 100 : 0

  return (
    // 화면 높이에 맞춘 세로 배치 — 표만 자체 스크롤하고 검색·필터·요약·헤더는 항상 보인다 (2026-09-16 피드백: 상단 고정)
    <div className="flex h-[calc(100vh/var(--ui-zoom,1))] min-h-[600px] flex-col px-8 pb-3 pt-6">
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

      {/* 입금예정월 지난 미입금 안내 (2026-10-08) */}
      <OverdueNotice deals={overdue} />

      <CollapseOnTableScroll>
      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <SummaryCard
          icon={<Database className="size-[15px]" />}
          tone="primary"
          label="매출 합계"
          value={<VatPair net={aggregate.sales} gross={aggregate.salesGross} />}
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
          value={<VatPair net={aggregate.purchase} gross={aggregate.purchaseGross} />}
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
      </CollapseOnTableScroll>

      {/* 검색·필터·요약·표 헤더 고정 (2026-09-16 피드백): 표만 자체 스크롤 상자 안에서 움직이고 그 위 영역은 항상 보임 */}
      <section className="mt-5 flex min-h-0 flex-1 flex-col rounded-2xl border bg-card" data-slot="deals-section">
        <div className="border-b p-4">
          <RememberList path="/deals" />
          <DealsFilters
            categories={lookups.categories}
            users={filterUsers}
            initial={{
              q: filters.q,
              years: filters.years,
              months: filters.months,
              categoryIds: filters.categoryIds,
              ownerUserIds: filters.ownerUserIds,
              paid: filters.paidStatuses,
              changedOnly: filters.changedOnly,
              review: filters.reviewStatuses,
              sort: filters.sort,
              dir: filters.dir,
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

        {/* 화면이 가벼워져 React 가 붙기 전에 셀렉트를 고를 수 있다 — 그때는 주소 이동으로 바로 적용 (2026-10-10) */}
        <script dangerouslySetInnerHTML={{ __html: PREHYDRATE_SELECT }} />
        <DealsTable
          canCopy={me != null && canCreateDeal(me.role)}
          columnFilters={{
            fCode: filters.fCode,
            fIssuer: filters.fIssuer,
            fSupplier: filters.fSupplier,
            ...pickColumnFilters(sp),
          }}
          rows={rows.map((r) => {
            const ref = { status: r.status as 'draft' | 'confirmed' | 'closed', ownerUserId: r.ownerUserId }
            const canViewIncentive = me != null && canViewCommission(me, ref)
            const canEditShared = me != null && canEditDealShared(me, ref, r.ownerTeam, shareTeams)
            return {
            ...r,
            // 볼 수 없는 거래의 요율은 화면으로 내려보내지 않는다
            commissionPct: canViewIncentive ? r.commissionPct : null,
            canTogglePaid:
              me != null &&
              canEditDealShared(
                me,
                { status: r.status as 'draft' | 'confirmed' | 'closed', ownerUserId: r.ownerUserId },
                r.ownerTeam,
                shareTeams,
              ),
            canDelete: me != null && canDeleteDeal(me, { status: r.status as 'draft' | 'confirmed' | 'closed', ownerUserId: r.ownerUserId }),
            // 인센티브·성과급 (2026-10-02): 관리자·회계는 전체, 영업은 본인 거래만 본다. 요율 수정은 거래 수정 권한과 같다 (10/6)
            canViewIncentive,
            canEditIncentive: canViewIncentive && canEditShared,
            canReview: me != null && me.role !== 'viewer',
            }
          })}
        />
        {me && me.role !== 'viewer' && (
          <DealQuickAdd
            categories={lookups.categories}
            users={filterUsers}
            meId={me.id}
            defaultYear={filters.year ?? new Date().getFullYear()}
            defaultMonth={filters.months?.length === 1 ? filters.months[0] : new Date().getMonth() + 1}
          />
        )}

        {/* 전체가 다 보일 때는 위 요약줄(총 N건)과 중복이라 생략 — 표 높이 확보 */}
        {rows.length < total && (
          <div className="shrink-0 px-4 py-2 text-xs text-muted-foreground">
            {total.toLocaleString()}건 중 {rows.length.toLocaleString()}건 표시 — 필터로 범위를 좁혀 주세요
          </div>
        )}
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

/** 매출·매입 합계를 VAT 미포함 / 포함으로 나눠 보여 준다 (2026-10-06 요청) */
function VatPair({ net, gross }: { net: number; gross: number }) {
  return (
    <span className="grid gap-0.5 text-[15px] leading-tight" data-slot="vat-pair">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-normal text-muted-foreground">VAT 미포함</span>
        <span className="tabular-nums">₩ {formatKRW(net)}</span>
      </span>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-normal text-muted-foreground">VAT 포함</span>
        <span className="tabular-nums">₩ {formatKRW(gross)}</span>
      </span>
    </span>
  )
}

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
  value: React.ReactNode
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

/** React 가 붙기 전(data-bulk-ready 없음) 셀렉트 변경 → 주소 이동. 붙은 뒤에는 React 가 처리한다 */
const PREHYDRATE_SELECT = `document.addEventListener('change',function(e){var t=e.target;if(!t||!t.matches||!t.matches('select[data-prehydrate-param]'))return;if(document.querySelector('[data-bulk-ready]'))return;var u=new URL(location.href);var k=t.getAttribute('data-prehydrate-param');if(t.value)u.searchParams.set(k,t.value);else u.searchParams.delete(k);u.searchParams.delete('page');location.assign(u.toString())})`
