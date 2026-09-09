'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appSetting } from '@/lib/db/schema'
import { canManageUsers, getSessionUser } from '@/server/auth/guards'
import { SETTING_KEYS } from '@/server/queries/app-settings'

const daysSchema = z.coerce.number().int().min(1, '1일 이상').max(365, '365일 이하')

/** 최근 수정 칸 음영 기간(일) 저장 — admin 전용 */
export async function saveChangeHighlightDays(raw: unknown): Promise<{ ok: true; days: number } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canManageUsers(user.role)) return { error: '관리자만 변경할 수 있습니다' }
  const parsed = daysSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '잘못된 값' }
  const days = parsed.data
  await db
    .insert(appSetting)
    .values({ key: SETTING_KEYS.changeHighlightDays, value: String(days), updatedBy: user.id })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: String(days), updatedBy: user.id, updatedAt: new Date() } })
  revalidatePath('/admin')
  revalidatePath('/deals')
  return { ok: true, days }
}
