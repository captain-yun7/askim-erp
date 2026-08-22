import Link from 'next/link'
import { Trophy } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TopControls } from '@/components/reports/top-controls'
import { getTopCounterparties, type TopSort } from '@/server/queries/reports-top'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'

type SP = { [k: string]: string | string[] | undefined }

const LIMIT = 20
const RANK_TONE = ['text-accent-foreground', 'text-subtle-foreground', 'text-accent-foreground']

export default async function TopCounterpartiesPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const year = sp.year ? parseInt(String(sp.year), 10) : 2026
  const sort: TopSort = sp.sort === 'profit' ? 'profit' : 'sales'

  const rows = await getTopCounterparties({ year, sort, limit: LIMIT })

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">TOP 거래처</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            발행처 기준 매출·손익 상위 {LIMIT}
            {sp.year === undefined || sp.year === '' ? ' · 2026' : ` · ${year}년`}
          </p>
        </div>
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-4">
          <TopControls initial={{ year: sp.year ? year : 2026, sort }} />
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-20 text-center text-sm text-muted-foreground">
            집계할 거래가 없습니다. 연도 필터를 조정해보세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 text-center">순위</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead className="text-right">매출</TableHead>
                  <TableHead className="text-right">손익</TableHead>
                  <TableHead className="text-right">건수</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const loss = r.profit < 0
                  return (
                    <TableRow key={r.id} className="hover:bg-muted/60">
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            'inline-flex items-center justify-center gap-1 font-medium tabular-nums',
                            i < 3 ? RANK_TONE[i] : 'text-muted-foreground',
                          )}
                        >
                          {i < 3 && <Trophy className="size-3.5" />}
                          {i + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/counterparties/${r.id}`}
                          className="text-[13px] font-medium text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                        {formatKRW(r.sales)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono text-xs font-medium tabular-nums',
                          loss ? 'text-destructive' : 'text-success-foreground',
                        )}
                      >
                        {formatKRW(r.profit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {r.count.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
