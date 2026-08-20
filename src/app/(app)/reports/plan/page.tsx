import { CashFlowSection, SalesTargetSection } from '@/components/reports/plan-sections'
import { YearTabs } from '@/components/reports/year-tabs'
import { canEditPlan, getSessionUser } from '@/server/auth/guards'
import { getPlanReport } from '@/server/queries/reports-plan'

type SP = { [k: string]: string | string[] | undefined }

export default async function PlanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const parsed = sp.year ? parseInt(String(sp.year), 10) : NaN
  const year = Number.isFinite(parsed) ? parsed : 2026

  const [report, user] = await Promise.all([getPlanReport({ year }), getSessionUser()])
  const editable = user ? canEditPlan(user.role) : false

  return (
    <div className="flex flex-col gap-5 px-8 pb-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">매출목표 및 현금흐름</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            상품군별 목표 대비 달성률 · 계좌 잔액 + 미수금/미지급 기준 예상 현금흐름
          </p>
        </div>
        <YearTabs year={year} path="/reports/plan" />
      </div>

      <SalesTargetSection report={report} editable={editable} />
      <CashFlowSection report={report} editable={editable} />
    </div>
  )
}
