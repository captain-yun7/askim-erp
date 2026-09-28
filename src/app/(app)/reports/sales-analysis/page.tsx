import Link from 'next/link'
import { PeriodControls } from '@/components/reports/period-controls'
import { ClientTypeSelect } from '@/components/reports/client-type-select'
import { XlsxExportButton } from '@/components/xlsx-export-button'
import { exportSalesAnalysisXlsx } from '@/server/actions/report-export'
import { sumAmounts, getSalesAnalysis, type CumulativeRow, type ShareRow } from '@/server/queries/reports-analysis'
import { requireBackoffice } from '@/server/auth/require-backoffice'
import { getSessionUser } from '@/server/auth/guards'
import { formatKRW } from '@/lib/format'
import { cn } from '@/lib/utils'

type SP = { [k: string]: string | string[] | undefined }

const pct = (r: number) => `${(r * 100).toFixed(1)}%`
const th = 'px-3 py-2 text-left text-[11.5px] font-medium text-muted-foreground'
const td = 'px-3 py-2 text-[13px]'
const numTd = cn(td, 'text-right font-mono tabular-nums')

/** 매출분석보고서 (2026-09-28 요청) — 거래 데이터를 거래처·산업군·상품·담당자·매입처로 묶은 통계 */
export default async function SalesAnalysisPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireBackoffice()
  const sp = await searchParams
  const now = new Date()
  const y = parseInt(String(sp.year ?? ''), 10)
  const year = Number.isFinite(y) ? y : now.getFullYear()
  // 기본은 이번 달, month=all 이면 연간
  const mRaw = sp.month === undefined ? (year === now.getFullYear() ? now.getMonth() + 1 : null) : sp.month === 'all' ? null : parseInt(String(sp.month), 10)
  const month = mRaw && mRaw >= 1 && mRaw <= 12 ? mRaw : null

  const [a, me] = await Promise.all([getSalesAnalysis({ year, month }), getSessionUser()])
  const canEdit = me != null && me.role !== 'viewer'
  const periodLabel = month ? `${year}. ${month}월` : `${year}년 전체`
  const unset = a.byClient.filter((r) => r.counterpartyId && !r.clientType)

  return (
    <div className="flex flex-col px-8 pb-10 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">매출분석보고서</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {periodLabel} · 귀속월 기준 · 1~5번 표는 VAT 포함, 누적 표는 VAT 제외
          </p>
        </div>
        <XlsxExportButton action={exportSalesAnalysisXlsx} filters={{ year, month }} />
      </div>

      <section className="mt-5 rounded-2xl border bg-card p-4">
        <PeriodControls year={year} month={month} basePath="/reports/sales-analysis" />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Stat label="매출 합계 (VAT 포함)" value={`₩ ${formatKRW(a.salesTotal)}`} sub={`매출 거래처 ${a.byClient.length}곳`} />
        <Stat label="매입 합계 (VAT 포함)" value={`₩ ${formatKRW(a.purchaseTotal)}`} sub={`매입 거래처 ${a.bySupplier.length}곳`} />
        <Stat label="매출 − 매입" value={`₩ ${formatKRW(a.salesTotal - a.purchaseTotal)}`} sub={a.salesTotal ? `매출 대비 ${pct((a.salesTotal - a.purchaseTotal) / a.salesTotal)}` : '-'} />
        <Stat label={`${year} 누적 매출 (VAT 제외)`} value={`₩ ${formatKRW(a.cumulative.total.sales)}`} sub={`누적 손익 ₩ ${formatKRW(a.cumulative.total.profit)}`} />
      </section>

      {unset.length > 0 && (
        <p data-slot="unset-note" className="mt-4 rounded-lg bg-accent px-3.5 py-2.5 text-[12.5px] text-accent-foreground">
          거래처 구분이 비어 있는 매출 거래처가 <b>{unset.length}곳</b> 있어 산업군 분석에 &quot;미지정&quot;으로 잡힙니다.
          {canEdit ? ' 아래 1번 표의 구분 칸에서 바로 지정하거나, ' : ' '}
          <Link href="/counterparties?ctype=none" className="underline underline-offset-4">
            거래처 목록(구분 미지정)
          </Link>
          에서 여러 곳을 한 번에 지정할 수 있습니다.
        </p>
      )}

      <Card no={1} title="매출 거래처 분석" note={`${periodLabel} · 귀속월 기준 · 발행처별`} slot="by-client">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className={cn(th, 'w-12')}>순위</th>
              <th className={th}>매출거래처</th>
              <th className={th}>거래처 구분</th>
              <th className={cn(th, 'text-right')}>매출금액(VAT포함)</th>
              <th className={cn(th, 'w-56 text-right')}>비율</th>
            </tr>
          </thead>
          <tbody>
            {a.byClient.map((r, i) => (
              <tr key={r.key} className="border-b last:border-0 hover:bg-muted/50">
                <td className={cn(td, 'text-muted-foreground')}>{i + 1}</td>
                <td className={cn(td, 'font-medium')}>{r.label}</td>
                <td className={td}>
                  {canEdit && r.counterpartyId ? (
                    <ClientTypeSelect counterpartyId={r.counterpartyId} name={r.label} value={r.clientType} />
                  ) : (
                    <span className={cn(!r.clientType && 'text-muted-foreground/60')}>{r.clientTypeLabel}</span>
                  )}
                </td>
                <td className={numTd}>{formatKRW(r.amount)}</td>
                <Ratio ratio={r.ratio} />
              </tr>
            ))}
            <Empty show={a.byClient.length === 0} cols={5} />
          </tbody>
          <Total cols={3} amount={a.salesTotal} show={a.byClient.length > 0} />
        </table>
      </Card>

      <div className="grid gap-x-5 lg:grid-cols-3">
        <ShareCard no={2} title="매출 산업군 분석" head="구분" rows={a.byClientType} slot="by-client-type" />
        <ShareCard no={3} title="매출 상품(매체) 분석" head="구분" rows={a.byCategory} slot="by-category" />
        <ShareCard no={4} title="영업사원 별 매출액" head="담당자" rows={a.byOwner} slot="by-owner" />
      </div>

      <Card no={5} title="매입 거래처 분석" note={`${periodLabel} · 귀속월 기준 · 매체사별`} slot="by-supplier">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className={cn(th, 'w-12')}>순위</th>
              <th className={th}>매입거래처</th>
              <th className={cn(th, 'text-right')}>매입금액(VAT포함)</th>
              <th className={cn(th, 'w-56 text-right')}>비율</th>
            </tr>
          </thead>
          <tbody>
            {a.bySupplier.map((r, i) => (
              <tr key={r.key} className="border-b last:border-0 hover:bg-muted/50">
                <td className={cn(td, 'text-muted-foreground')}>{i + 1}</td>
                <td className={cn(td, 'font-medium')}>{r.label}</td>
                <td className={numTd}>{formatKRW(r.amount)}</td>
                <Ratio ratio={r.ratio} />
              </tr>
            ))}
            <Empty show={a.bySupplier.length === 0} cols={4} />
          </tbody>
          <Total cols={2} amount={a.purchaseTotal} show={a.bySupplier.length > 0} />
        </table>
      </Card>

      <Card no={6} title={`${year} 누적 매출 / 매출이익`} note="현 시점 기준 · 그 해 전체(월 선택과 무관) · VAT 제외 · 손익 = 매출금 − 매입금" slot="cumulative">
        <div className="grid gap-5 p-4 lg:grid-cols-2">
          {a.cumulative.groups.map((g) => (
            <div key={g.team} data-team={g.team} className="overflow-hidden rounded-xl border">
              <div className="border-b bg-muted/50 px-3 py-2 text-[12.5px] font-medium">&lt;{g.title}&gt;</div>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className={th}>담당자</th>
                    <th className={cn(th, 'text-right')}>누적 매출액(VAT제외)</th>
                    <th className={cn(th, 'text-right')}>누적 손익</th>
                    <th className={cn(th, 'text-right')}>손익율</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <CumRow key={r.owner} r={r} />
                  ))}
                </tbody>
                {g.rows.length > 1 && (
                  <tfoot>
                    <CumRow r={g.total} total />
                  </tfoot>
                )}
              </table>
            </div>
          ))}
          {a.cumulative.groups.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted-foreground lg:col-span-2">집계할 거래가 없습니다.</p>}
        </div>
      </Card>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-muted px-5 py-4">
      <div className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[22px] font-normal leading-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-xs text-subtle-foreground">{sub}</div>
    </div>
  )
}

function Card({ no, title, note, slot, children }: { no: number; title: string; note?: string; slot: string; children: React.ReactNode }) {
  return (
    <section data-slot={slot} className="mt-5 overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-3 border-b px-4 py-3">
        <h2 className="text-[14px] font-medium">
          {no}. {title}
        </h2>
        {note && <span className="text-[12px] text-muted-foreground">{note}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

function ShareCard({ no, title, head, rows, slot }: { no: number; title: string; head: string; rows: ShareRow[]; slot: string }) {
  const total = sumAmounts(rows.map((r) => r.amount))
  return (
    <Card no={no} title={title} slot={slot}>
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className={th}>{head}</th>
            <th className={cn(th, 'text-right')}>매출금액(VAT포함)</th>
            <th className={cn(th, 'w-28 text-right')}>비율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b last:border-0 hover:bg-muted/50">
              <td className={cn(td, 'font-medium', r.label === '미지정' && 'text-muted-foreground')}>{r.label}</td>
              <td className={numTd}>{formatKRW(r.amount)}</td>
              <Ratio ratio={r.ratio} compact />
            </tr>
          ))}
          <Empty show={rows.length === 0} cols={3} />
        </tbody>
        <Total cols={1} amount={total} show={rows.length > 0} />
      </table>
    </Card>
  )
}

/** 비율 — 숫자 + 막대 */
function Ratio({ ratio, compact }: { ratio: number; compact?: boolean }) {
  return (
    <td className={cn(td, 'text-right')}>
      <span className="inline-flex items-center justify-end gap-2">
        {!compact && (
          <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
            <span className="block h-full rounded-full bg-brand/70" style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
          </span>
        )}
        <span className="w-12 font-mono text-[12.5px] tabular-nums">{pct(ratio)}</span>
      </span>
    </td>
  )
}

function Total({ cols, amount, show }: { cols: number; amount: number; show: boolean }) {
  if (!show) return null
  return (
    <tfoot>
      <tr className="border-t bg-muted/40 font-medium">
        <td className={td} colSpan={cols}>
          총합계
        </td>
        <td className={numTd}>{formatKRW(amount)}</td>
        <td className={cn(td, 'text-right font-mono text-[12.5px] tabular-nums')}>100.0%</td>
      </tr>
    </tfoot>
  )
}

function Empty({ show, cols }: { show: boolean; cols: number }) {
  if (!show) return null
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-10 text-center text-sm text-muted-foreground">
        이 기간에 집계할 거래가 없습니다.
      </td>
    </tr>
  )
}

function CumRow({ r, total }: { r: CumulativeRow; total?: boolean }) {
  return (
    <tr className={cn('border-b last:border-0', total && 'border-t bg-muted/40 font-medium')}>
      <td className={cn(td, !total && 'font-medium')}>{r.owner}</td>
      <td className={numTd}>{formatKRW(r.sales)}</td>
      <td className={cn(numTd, r.profit < 0 && 'text-destructive')}>{formatKRW(r.profit)}</td>
      <td className={cn(td, 'text-right font-mono text-[12.5px] tabular-nums')}>{r.margin === null ? '-' : pct(r.margin)}</td>
    </tr>
  )
}
