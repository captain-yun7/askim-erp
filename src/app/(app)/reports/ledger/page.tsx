import { LedgerControls, type LedgerHalf } from '@/components/reports/ledger-controls'
import { buildLedgerLines, getSalesLedger, type LedgerLine } from '@/server/queries/reports-ledger'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'

type SP = { [k: string]: string | string[] | undefined }

const TONE: Record<NonNullable<LedgerLine['tone']>, string> = {
  sales: 'bg-muted/40 font-medium',
  profit: 'font-medium',
  operating: 'bg-accent font-medium text-accent-foreground',
  net: 'bg-success/12 font-medium text-success-foreground',
  muted: 'text-muted-foreground',
}

function fmtPct(v: number, base: number) {
  if (!base) return ''
  return `${Math.round((v / base) * 100)}%`
}

export default async function LedgerPage({ searchParams }: { searchParams: Promise<SP> }) {
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

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">매출장표</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {year}년 {title} · 총매출·손익·영업이익·판관비(고정/변동)·당기순이익
        </p>
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-4">
          <LedgerControls year={year} half={half} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[12.5px]">
            <thead>
              <tr className="border-b bg-muted/40 text-[12px] text-muted-foreground">
                <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2.5 text-left font-medium backdrop-blur">
                  (월)
                </th>
                {monthIdx.map((i) => (
                  <th key={i} colSpan={2} className="border-l px-3 py-2.5 text-right font-medium text-foreground">
                    {i + 1}
                  </th>
                ))}
                <th colSpan={2} className="border-l bg-muted px-3 py-2.5 text-right font-medium text-foreground">
                  {title} 합계
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => {
                const total = sumIdx(ln.values)
                const totalBase = ln.pctBase ? sumIdx(ln.pctBase) : 0
                return (
                  <tr
                    key={ln.key}
                    className={cn(
                      'border-b last:border-0',
                      ln.tone && TONE[ln.tone],
                      ln.level === 1 && 'font-medium',
                      ln.level === 2 && 'text-[12px]',
                    )}
                  >
                    <td
                      className={cn(
                        'sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-1.5 backdrop-blur',
                        ln.level === 1 && 'pl-6',
                        ln.level === 2 && 'pl-9 text-muted-foreground',
                      )}
                    >
                      {ln.label}
                    </td>
                    {monthIdx.map((i) => {
                      const v = ln.values[i]
                      return (
                        <Cell key={i} value={v} pct={ln.pctBase ? fmtPct(v, ln.pctBase[i]) : undefined} />
                      )
                    })}
                    <Cell
                      value={total}
                      pct={ln.pctBase ? fmtPct(total, totalBase) : undefined}
                      emphasis
                    />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Cell({ value, pct, emphasis }: { value: number; pct?: string; emphasis?: boolean }) {
  return (
    <>
      <td
        className={cn(
          'whitespace-nowrap border-l px-3 py-1.5 text-right tabular-nums',
          value < 0 && 'text-destructive',
          emphasis && 'bg-muted/30 font-medium',
        )}
      >
        {Math.round(value) ? formatKRW(Math.round(value)) : <span className="text-muted-foreground/60">0</span>}
      </td>
      <td className={cn('w-12 px-1.5 py-1.5 text-right text-[11px] text-muted-foreground tabular-nums', emphasis && 'bg-muted/30')}>
        {pct ?? ''}
      </td>
    </>
  )
}
