import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PnlControls } from '@/components/reports/pnl-controls'
import { getMonthlyPnl } from '@/server/queries/reports-pnl'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'
import { requireBackoffice } from '@/server/auth/require-backoffice'

type SP = { [k: string]: string | string[] | undefined }

const DEFAULT_YEAR = 2026

export default async function PnlReportPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  await requireBackoffice()

  const sp = await searchParams
  const parsed = sp.year ? parseInt(String(sp.year), 10) : NaN
  const year = Number.isFinite(parsed) ? parsed : DEFAULT_YEAR

  const { rows, total } = await getMonthlyPnl({ year })

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">월별 손익</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            귀속월 기준 손익 · 영업이익 · 십일조 ({year}년)
          </p>
        </div>
        <PnlControls year={year} />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">월</TableHead>
              <TableHead className="text-right">매출총이익</TableHead>
              <TableHead className="text-right">판관비</TableHead>
              <TableHead className="text-right">영업이익</TableHead>
              <TableHead className="pr-4 text-right">십일조</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell className="pl-4 font-medium">{r.month}월</TableCell>
                <Amount value={r.grossProfit} />
                <Amount value={r.expense} />
                <Amount value={r.operatingProfit} />
                <Amount value={r.tithe} className="pr-4" />
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="pl-4 font-medium">합계</TableCell>
              <Amount value={total.grossProfit} bold />
              <Amount value={total.expense} bold />
              <Amount value={total.operatingProfit} bold />
              <Amount value={total.tithe} bold className="pr-4" />
            </TableRow>
          </TableFooter>
        </Table>
      </section>
    </div>
  )
}

function Amount({
  value,
  bold,
  className,
}: {
  value: number
  bold?: boolean
  className?: string
}) {
  return (
    <TableCell
      className={cn(
        'text-right tabular-nums',
        bold && 'font-medium',
        value < 0 && 'text-destructive',
        className,
      )}
    >
      ₩ {formatKRW(value)}
    </TableCell>
  )
}
