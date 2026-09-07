import { redirect } from 'next/navigation'
import { canAccessBackoffice, getSessionUser, isViewer } from './guards'

/** 영업 계정은 판관비·리포트·대시보드 접근 불가 → 거래 목록으로 */
export async function requireBackoffice() {
  const user = await getSessionUser()
  if (user && !canAccessBackoffice(user.role)) redirect('/deals')
  return user
}

/** 조회(viewer) 계정은 입력 화면 접근 불가 → 해당 목록으로 (beta 권한 정리 2026-09-07) */
export async function requireWriter(fallback: string) {
  const user = await getSessionUser()
  if (!user || isViewer(user.role)) redirect(fallback)
  return user
}
