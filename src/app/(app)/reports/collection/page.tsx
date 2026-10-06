import { AnnualTargetForm } from '@/components/reports/annual-target-form'
import { YearTabs } from '@/components/reports/year-tabs'
import { canEditPlan, getSessionUser } from '@/server/auth/guards'
import { getMonthlyCollection, type CollectionMonth } from '@/server/queries/reports-collection'
import { cn } from '@/lib/utils'
import { formatKRW as formatRaw } from '@/lib/format'
import { requireBackoffice } from '@/server/auth/require-backoffice'
import { XlsxExportButton } from '@/components/xlsx-export-button'
import { DrillButton, ReportDrill, type DrillLine } from '@/components/reports/report-drill'
import type { DrillFormula } from '@/lib/ledger-drill'
import { exportCollectionXlsx } from '@/server/actions/report-export'

const formatKRW = (v: number) => formatRaw(Math.round(v))

const COLLECTION_FORMULAS: Record<string, DrillFormula> = {
  col_profit_planned: { parts: [{ key: 'col_sales_planned', sign: 1 }, { key: 'col_purchase_planned', sign: -1 }] },
  col_profit_done: { parts: [{ key: 'col_sales_collected', sign: 1 }, { key: 'col_purchase_settled', sign: -1 }] },
}

type SP = { [k: string]: string | string[] | undefined }

const cell = 'whitespace-nowrap px-3 py-1.5 text-right tabular-nums'

function Amt({ v, strong, neg }: { v: number; strong?: boolean; neg?: boolean }) {
  return (
    <td className={cn(cell, strong && 'font-medium', (neg || v < 0) && v !== 0 && 'text-destructive')}>
      {v ? formatKRW(v) : <span className="text-muted-foreground/60">-</span>}
    </td>
  )
}

type RowDef = { key: string; label: string; sales: string; purchase: string; profit: string | null; bg: string; text?: string }

// 행 색 (2026-10-06 요청: 표가 잘 안 보인다) — 예정 / 수금·결산 / 미수·미결산을 바탕색으로 구분
const ROWS: RowDef[] = [
  { key: 'planned', label: '예정', sales: 'col_sales_planned', purchase: 'col_purchase_planned', profit: 'col_profit_planned', bg: 'bg-white' },
  { key: 'done', label: '수금/결산', sales: 'col_sales_collected', purchase: 'col_purchase_settled', profit: 'col_profit_done', bg: 'bg-sky-100', text: 'font-semibold' },
  { key: 'outstanding', label: '미수/미결산', sales: 'col_sales_outstanding', purchase: 'col_purchase_outstanding', profit: null, bg: 'bg-rose-50', text: 'text-red-700' },
]

function HalfTable({ months, label, lines }: { months: CollectionMonth[]; label: string; lines: Record<string, DrillLine> }) {
  return (
    <table className="w-full min-w-[1100px] border-collapse text-[13px]" data-slot="collection-table">
      <thead>
        <tr className="bg-slate-700 text-[12.5px] text-white">
          <th className="sticky left-0 z-10 bg-slate-700 px-4 py-2 text-left font-semibold">{label}</th>
          {months.map((m) => (
            <th key={m.month} colSpan={3} className="border-l border-slate-500 px-3 py-2 text-center font-semibold">
              {m.month}월
            </th>
          ))}
        </tr>
        <tr className="border-b border-slate-300 bg-slate-100 text-[12px] text-slate-700">
          <th className="sticky left-0 z-10 bg-slate-100 px-4 py-1.5" />
          {months.map((m) => (
            <HeadTriple key={m.month} />
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.key} data-row={r.key} className={cn('border-b border-slate-200 last:border-0', r.bg, r.text)}>
            <td className={cn('sticky left-0 z-10 whitespace-nowrap border-r border-slate-300 px-4 py-2 font-semibold text-slate-900', r.bg)}>{r.label}</td>
            {months.map((m) => (
              <FragmentRow key={m.month} month={m.month} row={r} lines={lines} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HeadTriple() {
  return (
    <>
      <th className="border-l border-slate-300 px-3 py-1.5 text-right font-semibold">매출</th>
      <th className="px-3 py-1.5 text-right font-semibold">매입</th>
      <th className="bg-amber-100 px-3 py-1.5 text-right font-semibold">예상손익</th>
    </>
  )
}

function DrillAmount({ lineKey, month, lines, className }: { lineKey: string; month: number; lines: Record<string, DrillLine>; className?: string }) {
  const v = lines[lineKey]?.values[month - 1] ?? 0
  return (
    <td className={cn(cell, className, v < 0 && 'text-red-600')}>
      {Math.round(v) ? (
        <DrillButton lineKey={lineKey} months={[month]}>
          {formatKRW(v)}
        </DrillButton>
      ) : (
        <span className="font-normal text-slate-400">-</span>
      )}
    </td>
  )
}

function FragmentRow({ month, row, lines }: { month: number; row: RowDef; lines: Record<string, DrillLine> }) {
  return (
    <>
      <DrillAmount lineKey={row.sales} month={month} lines={lines} className="border-l border-slate-300" />
      <DrillAmount lineKey={row.purchase} month={month} lines={lines} />
      {row.profit === null ? <td className={cn(cell, 'bg-slate-200')} /> : <DrillAmount lineKey={row.profit} month={month} lines={lines} className="bg-amber-100/70 font-semibold" />}
    </>
  )
}

export default async function CollectionPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireBackoffice()

  const sp = await searchParams
  const parsed = sp.year ? parseInt(String(sp.year), 10) : NaN
  const year = Number.isFinite(parsed) ? parsed : 2026

  const [report, user] = await Promise.all([getMonthlyCollection({ year }), getSessionUser()])
  const editable = user ? canEditPlan(user.role) : false
  const annual = report.annualSalesTarget
  const monthlyTarget = annual ? annual / 12 : null
  const pct = (v: number, base: number | null) => (base ? `${Math.round((v / base) * 100)}%` : '-')

  // 숫자를 누르면 근거 내역이 열린다 (2026-10-06 요청)
  const col = (pick: (m: CollectionMonth) => number) => report.months.map(pick)
  const lines: Record<string, DrillLine> = {
    col_sales_planned: { label: '매출 예정', values: col((m) => m.salesPlanned) },
    col_purchase_planned: { label: '매입 예정', values: col((m) => m.purchasePlanned) },
    col_profit_planned: { label: '예상손익 (예정)', values: col((m) => m.salesPlanned - m.purchasePlanned) },
    col_sales_collected: { label: '매출 수금', values: col((m) => m.salesCollected) },
    col_purchase_settled: { label: '매입 결산', values: col((m) => m.purchaseSettled) },
    col_profit_done: { label: '예상손익 (수금/결산)', values: col((m) => m.salesCollected - m.purchaseSettled) },
    col_sales_outstanding: { label: '매출 미수', values: col((m) => m.salesOutstanding) },
    col_purchase_outstanding: { label: '매입 미결산', values: col((m) => m.purchaseOutstanding) },
  }

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">월별 수금결산</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {year}년 · 예정(입금·결산예정일 기준) / 수금·결산(입금·지급일 기준, 완료 건) / 미수·미결산 · 금액은 VAT 포함 · <b className="font-medium text-foreground">숫자를 누르면 근거 내역이 열립니다</b>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <YearTabs year={year} path="/reports/collection" />
          <XlsxExportButton action={exportCollectionXlsx} filters={{ year }} />
        </div>
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-300 bg-card">
        <ReportDrill year={year} lines={lines} formulas={COLLECTION_FORMULAS}>
          <div className="overflow-x-auto border-b border-slate-300">
            <HalfTable months={report.months.slice(0, 6)} label="상반기" lines={lines} />
          </div>
          <div className="overflow-x-auto">
            <HalfTable months={report.months.slice(6)} label="하반기" lines={lines} />
          </div>
        </ReportDrill>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="text-[13px] font-medium">월별 달성율</div>
            <AnnualTargetForm year={year} initial={annual} editable={editable} />
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-700 text-[12.5px] text-white">
                <th className="px-4 py-2 text-left font-medium">월</th>
                <th className="px-3 py-2 text-right font-medium">예정</th>
                <th className="px-3 py-2 text-right font-medium">수금</th>
                <th className="px-3 py-2 text-right font-medium">달성율</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-300 bg-sky-100 font-semibold">
                <td className="px-4 py-2">소계</td>
                <Amt v={report.total.salesPlanned} />
                <Amt v={report.total.salesCollected} />
                <td className={cell}>{pct(report.total.salesCollected, annual)}</td>
              </tr>
              {report.months.map((m) => (
                <tr key={m.month} className="border-b border-slate-200 last:border-0 even:bg-slate-50">
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
