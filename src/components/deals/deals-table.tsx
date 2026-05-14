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
  purchaseAmountNet: string | null
  profit: string | null
  salesPaidStatus: string
  purchasePaidStatus: string
  salesDueDate: string | null
  purchaseDueDate: string | null
  categoryName: string | null
  ownerName: string | null
  issuerName: string | null
  advertiserName: string | null
  supplierName: string | null
}

export function DealsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-sm text-zinc-500">
        거래가 없습니다. 필터를 조정하거나 [+ 새 거래]를 눌러보세요.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>거래코드</TableHead>
            <TableHead>귀속</TableHead>
            <TableHead>구분</TableHead>
            <TableHead>담당</TableHead>
            <TableHead>발행처 / 광고주</TableHead>
            <TableHead>매체사</TableHead>
            <TableHead className="text-right">매출</TableHead>
            <TableHead className="text-right">매입</TableHead>
            <TableHead className="text-right">손익</TableHead>
            <TableHead className="text-center">상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="hover:bg-zinc-50">
              <TableCell className="font-mono text-xs">
                <Link href={`/deals/${r.id}`} className="text-blue-700 hover:underline">
                  {r.dealCode}
                </Link>
                {r.currency !== 'KRW' && (
                  <Badge variant="outline" className="ml-1">
                    {r.currency}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs">
                {String(r.accrualYear).slice(2)}/{r.accrualMonth}
              </TableCell>
              <TableCell className="text-xs">{r.categoryName ?? '-'}</TableCell>
              <TableCell className="text-xs">{r.ownerName ?? '-'}</TableCell>
              <TableCell className="text-xs">
                <div>{r.issuerName ?? '-'}</div>
                {r.advertiserName && r.advertiserName !== r.issuerName && (
                  <div className="text-zinc-500">→ {r.advertiserName}</div>
                )}
              </TableCell>
              <TableCell className="text-xs">{r.supplierName ?? '-'}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatKRW(r.salesAmountNet)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatKRW(r.purchaseAmountNet)}
              </TableCell>
              <TableCell
                className={`text-right font-mono text-xs ${
                  parseFloat(r.profit ?? '0') < 0
                    ? 'text-red-600'
                    : 'text-emerald-700'
                }`}
              >
                {formatKRW(r.profit)}
              </TableCell>
              <TableCell className="text-center text-xs">
                <span title={`입금예정 ${formatDate(r.salesDueDate)}`}>
                  {r.salesPaidStatus === 'completed' ? '✓' : '✗'}
                </span>
                <span className="mx-1 text-zinc-300">/</span>
                <span title={`결산예정 ${formatDate(r.purchaseDueDate)}`}>
                  {r.purchasePaidStatus === 'completed' ? '✓' : '✗'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
