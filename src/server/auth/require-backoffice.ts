import { redirect } from 'next/navigation'
import { canAccessBackoffice, getSessionUser } from './guards'

/** 영업 계정은 판관비·리포트·대시보드 접근 불가 → 거래 목록으로 */
export async function requireBackoffice() {
  const user = await getSessionUser()
  if (user && !canAccessBackoffice(user.role)) redirect('/deals')
  return user
}
