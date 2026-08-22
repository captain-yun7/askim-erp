import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { parseUiScale, type UiScale } from '@/lib/ui-scale'
import { getSessionUser } from '@/server/auth/guards'

/** 로그인 사용자의 화면 배율 — 비로그인이면 기본 */
export async function getMyUiScale(): Promise<UiScale> {
  const me = await getSessionUser()
  if (!me) return 'md'
  const [row] = await db
    .select({ uiScale: users.uiScale })
    .from(users)
    .where(eq(users.id, me.id))
    .limit(1)
  return parseUiScale(row?.uiScale)
}
