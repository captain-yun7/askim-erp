import { LedgerControls } from '@/components/reports/ledger-controls'
import { getSalesLedger, type LedgerBasis } from '@/server/queries/reports-ledger'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'

type SP = { [k: string]: string | string[] | undefined }

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const year = sp.year ? parseInt(String(sp.year), 10) : 2026
  const basis: LedgerBasis = sp.basis === 'cash' ? 'cash' : 'accrual'

  const ledger = await getSalesLedger({ year, basis })

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">매출장표</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          월별 매출·매입·손익 리포트
        </p>
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-4">
          <LedgerControls year={year} basis={basis} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[12px] text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">월</th>
                <th className="px-4 py-2.5 text-right font-medium">매출</th>
                <th className="px-4 py-2.5 text-right font-medium">매입</th>
                <th className="px-4 py-2.5 text-right font-medium">손익</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r) => (
                <tr key={r.month} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.month}월</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.sales ? formatKRW(r.sales) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.purchase ? formatKRW(r.purchase) : '-'}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2.5 text-right font-medium tabular-nums',
                      r.profit < 0 && 'text-destructive',
                    )}
                  >
                    {r.profit ? formatKRW(r.profit) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-semibold">
                <td className="px-4 py-3">합계</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatKRW(ledger.total.sales)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatKRW(ledger.total.purchase)}
                </td>
                <td
                  className={cn(
                    'px-4 py-3 text-right tabular-nums',
                    ledger.total.profit < 0 && 'text-destructive',
                  )}
                >
                  {formatKRW(ledger.total.profit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  )
}
