'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { ENTITY_COOKIE, entityInfo, isEntity } from '@/lib/entity'
import { getSessionUser } from '@/server/auth/guards'
import { audit } from '@/server/audit'

/** 좌측 상단 법인 선택 (2026-10-08 요청) — 쿠키에 저장하고 전 화면을 다시 그린다 */
export async function setCurrentEntity(raw: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!isEntity(raw)) return { error: '알 수 없는 법인입니다' }
  ;(await cookies()).set(ENTITY_COOKIE, raw, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  await audit({ action: 'entity.switch', summary: `법인 전환 → ${entityInfo(raw).label}` })
  revalidatePath('/', 'layout')
  return { ok: true }
}
