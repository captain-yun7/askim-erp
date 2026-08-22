import { AnnualTargetForm } from '@/components/reports/annual-target-form'
import { YearTabs } from '@/components/reports/year-tabs'
import { canEditPlan, getSessionUser } from '@/server/auth/guards'
import { getMonthlyCollection, type CollectionMonth } from '@/server/queries/reports-collection'
import { cn } from '@/lib/utils'
import { formatKRW as formatRaw } from '@/lib/format'

const formatKRW = (v: number) => formatRaw(Math.round(v))

type SP = { [k: string]: string | string[] | undefined }

const cell = 'whitespace-nowrap px-3 py-1.5 text-right tabular-nums'

function Amt({ v, strong, neg }: { v: number; strong?: boolean; neg?: boolean }) {
  return (
    <td className={cn(cell, strong && 'font-medium', (neg || v < 0) && v !== 0 && 'text-destructive')}>
      {v ? formatKRW(v) : <span className="text-muted-foreground/60">-</span>}
    </td>
  )
}

function HalfTable({ months, label }: { months: CollectionMonth[]; label: string }) {
  const rows: { key: string; label: string; pick: (m: CollectionMonth) => [number, number, number | null]; tone?: string }[] = [
    { key: 'planned', label: '예정', pick: (m) => [m.salesPlanned, m.purchasePlanned, m.salesPlanned - m.purchasePlanned] },
    {
      key: 'done',
      label: '수금/결산',
      pick: (m) => [m.salesCollected, m.purchaseSettled, m.salesCollected - m.purchaseSettled],
      tone: 'bg-accent',
    },
    { key: 'outstanding', label: '미수/미결산', pick: (m) => [m.salesOutstanding, m.purchaseOutstanding, null] },
  ]
  return (
    <table className="w-full min-w-[1100px] text-[12.5px]">
      <thead>
        <tr className="border-b bg-muted/40 text-[12px] text-muted-foreground">
          <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-left font-medium">{label}</th>
          {months.map((m) => (
            <th key={m.month} colSpan={3} className="border-l px-3 py-2 text-center font-medium text-foreground">
              {m.month}월
            </th>
          ))}
        </tr>
        <tr className="border-b text-[11.5px] text-muted-foreground">
          <th className="sticky left-0 z-10 bg-card px-4 py-1.5" />
          {months.map((m) => (
            <HeadTriple key={m.month} />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={cn('border-b last:border-0', r.tone)}>
            <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-1.5 font-medium">{r.label}</td>
            {months.map((m) => {
              const [s, p, profit] = r.pick(m)
              return (
                <FragmentRow key={m.month} s={s} p={p} profit={profit} />
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HeadTriple() {
  return (
    <>
      <th className="border-l px-3 py-1.5 text-right font-medium">매출</th>
      <th className="px-3 py-1.5 text-right font-medium">매입</th>
      <th className="px-3 py-1.5 text-right font-medium">예상손익</th>
    </>
  )
}

function FragmentRow({ s, p, profit }: { s: number; p: number; profit: number | null }) {
  return (
    <>
      <td className={cn(cell, 'border-l')}>{s ? formatKRW(s) : <span className="text-muted-foreground/60">-</span>}</td>
      <td className={cell}>{p ? formatKRW(p) : <span className="text-muted-foreground/60">-</span>}</td>
      {profit === null ? (
        <td className={cn(cell, 'bg-muted/40')} />
      ) : (
        <Amt v={profit} strong />
      )}
    </>
  )
}

export default async function CollectionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const parsed = sp.year ? parseInt(String(sp.year), 10) : NaN
  const year = Number.isFinite(parsed) ? parsed : 2026

  const [report, user] = await Promise.all([getMonthlyCollection({ year }), getSessionUser()])
  const editable = user ? canEditPlan(user.role) : false
  const annual = report.annualSalesTarget
  const monthlyTarget = annual ? annual / 12 : null
  const pct = (v: number, base: number | null) => (base ? `${Math.round((v / base) * 100)}%` : '-')

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">월별 수금결산</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {year}년 · 예정(입금·결산예정일 기준) / 수금·결산(입금·지급일 기준) / 미수·미결산
          </p>
        </div>
        <YearTabs year={year} path="/reports/collection" />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto border-b">
          <HalfTable months={report.months.slice(0, 6)} label="상반기" />
        </div>
        <div className="overflow-x-auto">
          <HalfTable months={report.months.slice(6)} label="하반기" />
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="text-[13px] font-medium">월별 달성율</div>
            <AnnualTargetForm year={year} initial={annual} editable={editable} />
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b bg-muted/40 text-[12px] text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">월</th>
                <th className="px-3 py-2 text-right font-medium">예정</th>
                <th className="px-3 py-2 text-right font-medium">수금</th>
                <th className="px-3 py-2 text-right font-medium">달성율</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b bg-muted/30 font-medium">
                <td className="px-4 py-2">소계</td>
                <Amt v={report.total.salesPlanned} />
                <Amt v={report.total.salesCollected} />
                <td className={cell}>{pct(report.total.salesCollected, annual)}</td>
              </tr>
              {report.months.map((m) => (
                <tr key={m.month} className="border-b last:border-0">
                  <td className="px-4 py-1.5">{m.month}</td>
                  <Amt v={m.salesPlanned} />
                  <Amt v={m.salesCollected} />
                  <td className={cell}>{pct(m.salesCollected, monthlyTarget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="h-fit rounded-2xl border bg-card p-4 text-[12.5px]">
          <div className="mb-3 text-[13px] font-medium">목표</div>
          <dl className="grid grid-cols-2 gap-y-2">
            <dt className="text-muted-foreground">연 목표매출</dt>
            <dd className="text-right font-mono font-medium tabular-nums">
              {annual != null ? formatKRW(annual) : '미설정'}
            </dd>
            <dt className="text-muted-foreground">월 목표매출</dt>
            <dd className="text-right font-mono tabular-nums">
              {monthlyTarget != null ? formatKRW(Math.round(monthlyTarget)) : '-'}
            </dd>
            <dt className="text-muted-foreground">연 달성율</dt>
            <dd className="text-right font-mono font-medium tabular-nums">
              {pct(report.total.salesCollected, annual)}
            </dd>
          </dl>
          {!editable && (
            <p className="mt-3 text-[11.5px] text-muted-foreground">연 목표매출은 회계/admin 이 설정합니다.</p>
          )}
        </div>
      </section>
    </div>
  )
}
