import { LedgerControls, type LedgerHalf } from '@/components/reports/ledger-controls'
import { XlsxExportButton } from '@/components/xlsx-export-button'
import { exportLedgerXlsx } from '@/server/actions/report-export'
import { buildLedgerLines, getSalesLedger } from '@/server/queries/reports-ledger'
import { DrillButton, ReportDrill } from '@/components/reports/report-drill'
import { buildLedgerFormulas } from '@/lib/ledger-drill'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'
import { requireBackoffice } from '@/server/auth/require-backoffice'

type SP = { [k: string]: string | string[] | undefined }

/**
 * 행 색 (2026-10-06 요청: 표가 잘 안 보인다) — 구간마다 다른 바탕색으로 구분한다.
 * 왼쪽 고정 칸도 같은 색으로 칠해야 가로로 넘길 때 글자가 비치지 않는다.
 */
function rowStyle(key: string): { bg: string; text: string } {
  if (key.startsWith('sales_')) return { bg: 'bg-sky-100', text: 'font-semibold text-slate-900' }
  if (key.startsWith('cogs_')) return { bg: 'bg-white', text: 'text-slate-700' }
  if (key.startsWith('gross_')) return { bg: 'bg-amber-100', text: 'font-semibold text-slate-900' }
  if (key.startsWith('op_')) return { bg: 'bg-orange-200', text: 'font-semibold text-slate-900' }
  if (key === 'sgna') return { bg: 'bg-slate-300', text: 'font-semibold text-slate-900' }
  if (key === 'fixed' || key === 'variable') return { bg: 'bg-slate-100', text: 'font-semibold text-slate-800' }
  if (key.startsWith('net_')) return { bg: 'bg-emerald-200', text: 'font-semibold text-slate-900' }
  if (key === 'tithe') return { bg: 'bg-slate-100', text: 'text-slate-700' }
  return { bg: 'bg-white', text: 'text-slate-800' }
}

function fmtPct(v: number, base: number) {
  if (!base) return ''
  return `${Math.round((v / base) * 100)}%`
}

export default async function LedgerPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireBackoffice()

  const sp = await searchParams
  const year = sp.year ? parseInt(String(sp.year), 10) : 2026
  const half: LedgerHalf = sp.half === 'h2' ? 'h2' : sp.half === 'all' ? 'all' : 'h1'

  const report = await getSalesLedger({ year })
  const lines = buildLedgerLines(report)

  const monthIdx =
    half === 'h1'
      ? [0, 1, 2, 3, 4, 5]
      : half === 'h2'
        ? [6, 7, 8, 9, 10, 11]
        : Array.from({ length: 12 }, (_, i) => i)
  const title = half === 'h1' ? '상반기' : half === 'h2' ? '하반기' : '연간'

  const sumIdx = (arr: number[]) => monthIdx.reduce((acc, i) => acc + arr[i], 0)

  const drillLines = Object.fromEntries(lines.map((ln) => [ln.key, { label: ln.label, values: ln.values }]))
  const months = monthIdx.map((i) => i + 1)

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">매출장표</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {year}년 {title} · 총매출·매출원가·손익 모두 VAT 포함 (엑셀 매출장표와 동일 기준) · <b className="font-medium text-foreground">숫자를 누르면 근거 내역이 열립니다</b>
        </p>
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-300 bg-card">
        <div className="border-b border-slate-300 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <LedgerControls year={year} half={half} />
            <XlsxExportButton action={exportLedgerXlsx} filters={{ year }} />
          </div>
        </div>

        <ReportDrill year={year} lines={drillLines} formulas={buildLedgerFormulas(report)}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-[13px]" data-slot="ledger-table">
              <thead>
                <tr className="bg-slate-700 text-[12.5px] text-white">
                  <th className="sticky left-0 z-10 bg-slate-700 px-4 py-2.5 text-left font-semibold">(월)</th>
                  {monthIdx.map((i) => (
                    <th key={i} colSpan={2} className="border-l border-slate-500 px-3 py-2.5 text-right font-semibold">
                      {i + 1}월
                    </th>
                  ))}
                  <th colSpan={2} className="border-l-2 border-slate-400 bg-slate-800 px-3 py-2.5 text-right font-semibold">
                    {title} 합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((ln) => {
                  const total = sumIdx(ln.values)
                  const totalBase = ln.pctBase ? sumIdx(ln.pctBase) : 0
                  const st = rowStyle(ln.key)
                  return (
                    <tr key={ln.key} data-row={ln.key} className={cn('border-b border-slate-200 last:border-0', st.bg, st.text, st.bg === 'bg-white' && 'hover:bg-sky-50')}>
                      <td className={cn('sticky left-0 z-10 whitespace-nowrap border-r border-slate-300 px-4 py-1.5', st.bg, ln.level === 1 && 'pl-6', ln.level === 2 && 'pl-9')}>
                        {ln.label}
                      </td>
                      {monthIdx.map((i) => {
                        const v = ln.values[i]
                        return <Cell key={i} lineKey={ln.key} months={[i + 1]} value={v} pct={ln.pctBase ? fmtPct(v, ln.pctBase[i]) : undefined} />
                      })}
                      <Cell lineKey={ln.key} months={months} value={total} pct={ln.pctBase ? fmtPct(total, totalBase) : undefined} emphasis />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ReportDrill>
      </section>
    </div>
  )
}

function Cell({ lineKey, months, value, pct, emphasis }: { lineKey: string; months: number[]; value: number; pct?: string; emphasis?: boolean }) {
  const rounded = Math.round(value)
  return (
    <>
      <td
        className={cn(
          'whitespace-nowrap border-l border-slate-200 px-3 py-1.5 text-right tabular-nums',
          value < 0 && 'text-red-600',
          emphasis && 'border-l-2 border-l-slate-400 font-semibold',
        )}
      >
        {rounded ? (
          <DrillButton lineKey={lineKey} months={months}>
            {formatKRW(rounded)}
          </DrillButton>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
      <td className="w-12 px-1.5 py-1.5 text-right text-[11.5px] font-normal text-slate-500 tabular-nums">{pct ?? ''}</td>
    </>
  )
}
