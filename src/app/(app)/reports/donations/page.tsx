import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { YearControls } from '@/components/reports/year-controls'
import { getDonations } from '@/server/queries/reports-donations'
import { formatKRW } from '@/lib/format'
import { requireBackoffice } from '@/server/auth/require-backoffice'

type SP = { [k: string]: string | string[] | undefined }

const PAYMENT_LABEL: Record<string, string> = { corporate_card: '법인카드', personal_card: '개인카드', cash: '현금', bank_transfer: '이체' }

/** 기부금 월별 사용내역 (2026-09-09 피드백) */
export default async function DonationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireBackoffice()
  const sp = await searchParams
  const parsed = sp.year ? parseInt(String(sp.year), 10) : NaN
  const year = Number.isFinite(parsed) ? parsed : new Date().getFullYear()
  const { months, total, count } = await getDonations({ year })
  const active = months.filter((m) => m.rows.length > 0)

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">기부금</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {year}년 월별 기부금 사용내역 · 판관비 거래항목 &apos;기부금&apos; 기준
          </p>
        </div>
        <YearControls year={year} basePath="/reports/donations" />
      </div>

      <section className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="rounded-lg bg-muted px-5 py-4">
          <div className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground">연간 총액</div>
          <div className="mt-2.5 text-[24px] font-normal leading-tight tabular-nums">₩ {formatKRW(total)}</div>
          <div className="mt-1.5 text-xs text-subtle-foreground">{count.toLocaleString()}건</div>
        </div>
        <div className="rounded-lg bg-muted px-5 py-4">
          <div className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground">월 평균</div>
          <div className="mt-2.5 text-[24px] font-normal leading-tight tabular-nums">₩ {formatKRW(active.length ? total / active.length : 0)}</div>
          <div className="mt-1.5 text-xs text-subtle-foreground">사용한 달 {active.length}개월 기준</div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">월</TableHead>
              <TableHead className="text-right">건수</TableHead>
              <TableHead className="pr-4 text-right">월 합계</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((m) => (
              <TableRow key={m.month} className={m.rows.length === 0 ? 'text-muted-foreground/60' : ''}>
                <TableCell className="pl-4 font-medium">{m.month}월</TableCell>
                <TableCell className="text-right tabular-nums">{m.rows.length}</TableCell>
                <TableCell className="pr-4 text-right font-mono tabular-nums">{m.rows.length ? formatKRW(m.total) : '-'}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
              <TableCell className="pl-4">연간 합계</TableCell>
              <TableCell className="text-right tabular-nums">{count}</TableCell>
              <TableCell className="pr-4 text-right font-mono tabular-nums">{formatKRW(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {active.map((m) => (
        <section key={m.month} className="mt-5 overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5 text-[12.5px]">
            <span className="font-medium">{m.month}월 사용처</span>
            <span className="text-muted-foreground">
              {m.rows.length}건 · 합계 <b className="text-foreground">₩{formatKRW(m.total)}</b>
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">지출일</TableHead>
                <TableHead>사용처</TableHead>
                <TableHead>품목</TableHead>
                <TableHead>수단</TableHead>
                <TableHead className="pr-4 text-right">금액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-mono text-xs text-muted-foreground">{r.expenseDate}</TableCell>
                  <TableCell className="text-[13px]">{r.counterpartyText ?? '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.itemName ?? '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod}</TableCell>
                  <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">{formatKRW(r.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ))}
    </div>
  )
}
