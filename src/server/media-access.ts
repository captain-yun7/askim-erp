import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { isAdmin, type SessionUser } from '@/server/auth/guards'

/**
 * 매체관리 편집 가능 여부 (2026-11-09 요청 — 구글시트처럼 뷰어/편집자)
 * 관리자는 항상 편집자, 조회 계정은 항상 뷰어, 나머지는 사용자 관리에서 정한 값.
 * 바꾸면 다시 로그인하지 않아도 바로 반영되도록 매번 DB에서 읽는다.
 */
export async function canEditMedia(user: SessionUser | null): Promise<boolean> {
  if (!user) return false
  if (isAdmin(user.role)) return true
  if (user.role === 'viewer') return false
  const [row] = await db.select({ access: users.mediaAccess, active: users.isActive }).from(users).where(eq(users.id, user.id))
  return row?.active === true && row.access === 'edit'
}
