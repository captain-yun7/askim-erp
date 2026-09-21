'use client'

import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatKRW } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DonationMonth } from '@/server/queries/reports-donations'

const PAYMENT_LABEL: Record<string, string> = { corporate_card: '법인카드', personal_card: '개인카드', cash: '현금', bank_transfer: '이체' }

/** 월별 기부금 표 — 월을 클릭하면 그 달 사용내역이 바로 아래에 펼쳐진다 (2026-09-16 피드백: 아래로 쭉 나열하지 않기) */
export function DonationsTable({ months, total, count }: { months: DonationMonth[]; total: number; count: number }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const toggle = (month: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  const withRows = months.filter((m) => m.rows.length > 0)
  const allOpen = withRows.length > 0 && withRows.every((m) => open.has(m.month))

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
        <span>월을 클릭하면 사용내역이 펼쳐집니다</span>
        {withRows.length > 0 && (
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => setOpen(allOpen ? new Set() : new Set(withRows.map((m) => m.month)))}
          >
            {allOpen ? '모두 접기' : '모두 펼치기'}
          </button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">월</TableHead>
            <TableHead className="text-right">건수</TableHead>
            <TableHead className="pr-4 text-right">월 합계</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((m) => {
            const has = m.rows.length > 0
            const expanded = has && open.has(m.month)
            return (
              <Fragment key={m.month}>
                <TableRow
                  data-month={m.month}
                  aria-expanded={has ? expanded : undefined}
                  tabIndex={has ? 0 : undefined}
                  role={has ? 'button' : undefined}
                  className={cn(has ? 'cursor-pointer hover:bg-muted/60' : 'text-muted-foreground/60 hover:bg-transparent', expanded && 'bg-muted/40')}
                  onClick={has ? () => toggle(m.month) : undefined}
                  onKeyDown={has ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(m.month)) : undefined}
                >
                  <TableCell className="pl-4 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90', !has && 'invisible')} />
                      {m.month}월
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.rows.length}</TableCell>
                  <TableCell className="pr-4 text-right font-mono tabular-nums">{has ? formatKRW(m.total) : '-'}</TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent" data-slot="donation-detail">
                    <TableCell colSpan={3} className="bg-muted/20 p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-[11.5px] text-muted-foreground">
                            <th className="py-1.5 pl-10 font-medium">지출일</th>
                            <th className="py-1.5 font-medium">사용처</th>
                            <th className="py-1.5 font-medium">품목</th>
                            <th className="py-1.5 font-medium">수단</th>
                            <th className="py-1.5 pr-4 text-right font-medium">금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.rows.map((r) => (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="py-1.5 pl-10 font-mono text-xs text-muted-foreground">{r.expenseDate}</td>
                              <td className="py-1.5 text-[13px]">{r.counterpartyText ?? '-'}</td>
                              <td className="py-1.5 text-xs text-muted-foreground">{r.itemName ?? '-'}</td>
                              <td className="py-1.5 text-xs text-muted-foreground">{PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-xs tabular-nums">{formatKRW(r.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
          <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
            <TableCell className="pl-4">연간 합계</TableCell>
            <TableCell className="text-right tabular-nums">{count}</TableCell>
            <TableCell className="pr-4 text-right font-mono tabular-nums">{formatKRW(total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>
  )
}
