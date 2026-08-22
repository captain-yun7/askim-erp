import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatDate, formatKRW } from '@/lib/format'

type Row = {
  id: string
  dealCode: string
  accrualYear: number
  accrualMonth: number
  currency: string
  status: string
  itemName: string | null
  salesAmountNet: string | null
  salesVat: string | null
  purchaseAmountNet: string | null
  purchaseVat: string | null
  profit: string | null
  salesPaidStatus: string
  purchasePaidStatus: string
  salesDueDate: string | null
  salesPaidDate: string | null
  salesInvoiceDate: string | null
  purchaseDueDate: string | null
  purchasePaidDate: string | null
  purchaseInvoiceDate: string | null
  categoryName: string | null
  ownerName: string | null
  issuerName: string | null
  advertiserName: string | null
  supplierName: string | null
}


function DatePair({ planned, actual }: { planned: string | null; actual: string | null }) {
  return (
    <div className="text-[12px] leading-tight tabular-nums">
      <div className="text-muted-foreground">{formatDate(planned)}</div>
      <div className={cn(actual ? 'font-medium text-foreground' : 'text-subtle-foreground')}>
        {formatDate(actual)}
      </div>
    </div>
  )
}

function StatusPill({ done, doneLabel, todoLabel }: { done: boolean; doneLabel: string; todoLabel: string; }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[12px]',
        done ? 'text-success-foreground' : 'text-accent-foreground',
      )}
    >
      <span className={cn('size-[7px] rounded-full', done ? 'bg-success' : 'bg-brand')} />
      {done ? doneLabel : todoLabel}
    </span>
  )
}

export function DealsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-20 text-center text-sm text-muted-foreground">
        거래가 없습니다. 필터를 조정하거나 [+ 새 거래]를 눌러보세요.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>거래코드</TableHead>
            <TableHead>귀속</TableHead>
            <TableHead>상품구분</TableHead>
            <TableHead>담당</TableHead>
            <TableHead>발행처 / 광고주</TableHead>
            <TableHead>매체사</TableHead>
            <TableHead className="text-right">매출</TableHead>
            <TableHead className="text-right">부가세</TableHead>
            <TableHead className="text-right">매입</TableHead>
            <TableHead className="text-right">부가세</TableHead>
            <TableHead className="text-right">손익</TableHead>
            <TableHead className="text-center">입금 / 결산</TableHead>
            <TableHead>매출계산서<br />발행일</TableHead>
            <TableHead>매입계산서<br />발행일</TableHead>
            <TableHead>입금예정일<br />입금일</TableHead>
            <TableHead>결산예정일<br />결산일</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const owner = r.ownerName ?? '-'
            const loss = parseFloat(r.profit ?? '0') < 0
            return (
              <TableRow key={r.id} className="hover:bg-muted/60">
                <TableCell>
                  <Link
                    href={`/deals/${r.id}`}
                    className="text-[13px] font-medium tabular-nums text-foreground hover:text-brand"
                  >
                    {r.dealCode}
                  </Link>
                  {r.currency !== 'KRW' && (
                    <Badge variant="outline" className="ml-1">
                      {r.currency}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {String(r.accrualYear).slice(2)}/{r.accrualMonth}
                </TableCell>
                <TableCell>
                  {r.categoryName ? (
                    <span className="inline-flex h-[22px] items-center rounded-full bg-info px-2.5 text-[12px] text-info-foreground">
                      {r.categoryName}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-[13px]">{owner}</span>
                </TableCell>
                <TableCell className="text-[13px]">
                  <div>{r.issuerName ?? '-'}</div>
                  {r.advertiserName && r.advertiserName !== r.issuerName && (
                    <div className="text-muted-foreground">→ {r.advertiserName}</div>
                  )}
                </TableCell>
                <TableCell className="text-[13px] text-muted-foreground">{r.supplierName ?? '-'}</TableCell>
                <TableCell className="text-right text-[13px] tabular-nums">
                  {formatKRW(r.salesAmountNet)}
                </TableCell>
                <TableCell className="text-right text-[13px] text-muted-foreground tabular-nums">
                  {formatKRW(r.salesVat)}
                </TableCell>
                <TableCell className="text-right text-[13px] tabular-nums">
                  {formatKRW(r.purchaseAmountNet)}
                </TableCell>
                <TableCell className="text-right text-[13px] text-muted-foreground tabular-nums">
                  {formatKRW(r.purchaseVat)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right text-[13px] font-medium tabular-nums',
                    loss ? 'text-destructive' : 'text-success-foreground',
                  )}
                >
                  {formatKRW(r.profit)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-3">
                    <span title={`입금예정 ${formatDate(r.salesDueDate)}`}>
                      <StatusPill
                        done={r.salesPaidStatus === 'completed'}
                        doneLabel="입금"
                        todoLabel="미입금"
                      />
                    </span>
                    <span title={`결산예정 ${formatDate(r.purchaseDueDate)}`}>
                      <StatusPill
                        done={r.purchasePaidStatus === 'completed'}
                        doneLabel="결산"
                        todoLabel="미결산"
                      />
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground tabular-nums">
                  {formatDate(r.salesInvoiceDate)}
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground tabular-nums">
                  {formatDate(r.purchaseInvoiceDate)}
                </TableCell>
                <TableCell>
                  <DatePair planned={r.salesDueDate} actual={r.salesPaidDate} />
                </TableCell>
                <TableCell>
                  <DatePair planned={r.purchaseDueDate} actual={r.purchasePaidDate} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
