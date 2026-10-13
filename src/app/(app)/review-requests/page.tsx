import { redirect } from 'next/navigation'
import { YearTabs } from '@/components/reports/year-tabs'
import { ReviewCountTable } from '@/components/review/review-count-table'
import { getSessionUser, isAdmin } from '@/server/auth/guards'
import { getReviewCounts } from '@/server/queries/review-requests'

export const dynamic = 'force-dynamic'

/** 월별·담당자별 수정요청 횟수 (2026-10-12 요청) — 관리자만 보고 고친다 */
export default async function ReviewRequestsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await getSessionUser()
  if (!user || !isAdmin(user.role)) redirect('/')
  const sp = await searchParams
  const y = Number(sp.year)
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear()
  const rows = await getReviewCounts(year)
  return (
    <div className="flex flex-col gap-4 px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">수정요청 집계</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          거래에 수정요청을 건 횟수를 월별·담당자별로 자동으로 셉니다 · 관리자만 볼 수 있고, 숫자를 눌러 고칠 수 있습니다(예: 1회 차감)
        </p>
      </div>
      <YearTabs year={year} path="/review-requests" />
      <ReviewCountTable rows={rows} year={year} />
      <p className="text-xs text-muted-foreground">
        요청한 날(한국 시간)의 달, 요청 당시 거래 담당자 기준입니다. 관리자가 수정요청을 걸었다가 바로 지우면 그 1회는 빠집니다. 밑줄 친 숫자는 관리자가 고친 값입니다.
      </p>
    </div>
  )
}
