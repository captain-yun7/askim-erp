import { DonationsTable } from '@/components/reports/donations-table'
import { YearControls } from '@/components/reports/year-controls'
import { getDonations } from '@/server/queries/reports-donations'
import { formatKRW } from '@/lib/format'
import { requireBackoffice } from '@/server/auth/require-backoffice'
import { XlsxExportButton } from '@/components/xlsx-export-button'
import { exportDonationsXlsx } from '@/server/actions/report-export'

type SP = { [k: string]: string | string[] | undefined }

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
        <div className="flex items-center gap-2">
          <YearControls year={year} basePath="/reports/donations" />
          <XlsxExportButton action={exportDonationsXlsx} filters={{ year }} />
        </div>
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

      <DonationsTable months={months} total={total} count={count} />
    </div>
  )
}
