import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Database,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react'
import { getDashboard } from '@/server/queries/dashboard'
import { cn } from '@/lib/utils'
import { formatKRW, formatKRWShort } from '@/lib/format'

export default async function DashboardPage() {
  const d = await getDashboard()

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">대시보드</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {d.period.year}년 {d.period.month}월 기준 경영 현황
        </p>
      </div>

      <section className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <SummaryCard
          icon={<Database className="size-[15px]" />}
          tone="primary"
          label={`${d.period.month}월 매출`}
          value={`₩ ${formatKRW(d.thisMonth.sales)}`}
          sub="이번 달 발생 매출"
        />
        <SummaryCard
          icon={<ShoppingCart className="size-[15px]" />}
          tone="muted"
          label={`${d.period.month}월 매입`}
          value={`₩ ${formatKRW(d.thisMonth.purchase)}`}
          sub="이번 달 발생 매입"
        />
        <SummaryCard
          icon={<TrendingUp className="size-[15px]" />}
          tone="ok"
          label={`${d.period.month}월 손익`}
          value={`₩ ${formatKRW(d.thisMonth.profit)}`}
          valueClass={d.thisMonth.profit < 0 ? 'text-destructive' : 'text-success-foreground'}
          sub={
            <>
              마진율{' '}
              <b className="font-semibold text-foreground">
                {d.thisMonth.margin.toFixed(1)}%
              </b>
            </>
          }
        />
        <SummaryCard
          icon={<TrendingUp className="size-[15px]" />}
          tone="primary"
          label={`${d.period.year} 누적 손익`}
          value={`₩ ${formatKRW(d.yearToDate.profit)}`}
          sub={<>매출 ₩{formatKRWShort(d.yearToDate.sales)}</>}
        />
      </section>

      <section className="mt-5 grid gap-3.5 lg:grid-cols-2">
        <AlertCard
          label="미입금 (예정일 지남)"
          count={d.overdueReceivable.count}
          amount={d.overdueReceivable.amount}
          href="/deals?paid=unpaid"
        />
        <AlertCard
          label="미결산 (예정일 지남)"
          count={d.overduePayable.count}
          amount={d.overduePayable.amount}
          href="/deals?paid=unsettled"
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-medium">최근 거래</h2>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            전체 보기 <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {d.recent.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            거래가 없습니다.
          </div>
        ) : (
          <ul className="divide-y">
            {d.recent.map((r) => {
              const loss = (parseFloat(r.profit ?? '0') || 0) < 0
              return (
                <li key={r.id}>
                  <Link
                    href={`/deals/${r.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="text-[13px] font-medium tabular-nums text-foreground">
                      {r.dealCode}
                    </span>
                    {r.categoryName && (
                      <span className="inline-flex rounded-full bg-info px-2.5 py-0.5 text-[12px] text-info-foreground">
                        {r.categoryName}
                      </span>
                    )}
                    <span className="truncate text-muted-foreground">
                      {r.itemName ?? '-'}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {r.ownerName ?? '-'}
                    </span>
                    <span
                      className={cn(
                        'w-28 text-right text-[13px] font-medium tabular-nums',
                        loss ? 'text-destructive' : 'text-success-foreground',
                      )}
                    >
                      {formatKRW(r.profit)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

const TONE = {
  primary: 'bg-background text-foreground',
  muted: 'bg-background text-muted-foreground',
  ok: 'bg-background text-success-foreground',
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
  return (
    <div className="rounded-lg bg-muted px-5 py-4">
      <div className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.04em] text-muted-foreground">
        <span
          className={cn(
            'grid size-[26px] place-items-center rounded-full',
            TONE[tone],
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className={cn('mt-2.5 text-[24px] font-normal leading-tight tabular-nums', valueClass)}>
        {value}
      </div>
      <div className="mt-1.5 text-xs text-subtle-foreground">{sub}</div>
    </div>
  )
}

function AlertCard({
  label,
  count,
  amount,
  href,
}: {
  label: string
  count: number
  amount: number
  href: string
}) {
  const has = count > 0
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3.5 rounded-lg p-4 transition-opacity hover:opacity-90',
        has ? 'bg-accent text-accent-foreground' : 'bg-muted text-foreground',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full bg-background',
          has ? 'text-accent-foreground' : 'text-subtle-foreground',
        )}
      >
        {has ? <AlertTriangle className="size-4" /> : <Clock className="size-4" />}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="mt-0.5 text-lg font-normal tabular-nums">
          {count.toLocaleString()}건
          <span className="ml-2 text-sm font-medium">
            ₩{formatKRWShort(amount)}
          </span>
        </div>
      </div>
      <ArrowRight className="ml-auto size-4 shrink-0" />
    </Link>
  )
}
