import { redirect } from 'next/navigation'
import { EmployeeTable } from '@/components/hr/employee-table'
import { audit } from '@/server/audit'
import { canAccessHr, getSessionUser } from '@/server/auth/guards'
import { listEmployees } from '@/server/queries/employees'

export const dynamic = 'force-dynamic'

export default async function HrPage() {
  const user = await getSessionUser()
  // 급여 정보 — 관리자만 (2026-10-02 요청). 그 외 계정은 화면 자체가 열리지 않는다
  if (!user || !canAccessHr(user.role)) redirect('/')
  const rows = await listEmployees()
  await audit({ action: 'hr.view', summary: '인사관리 열람' })
  // 퇴사 여부 기준일 — 서버(한국 시간)에서 정해 내려 준다
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">인사관리</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">구성원 급여·인센티브 기준 — 관리자만 조회·수정할 수 있습니다</p>
      </div>
      <EmployeeTable rows={rows} today={today} />
    </div>
  )
}
