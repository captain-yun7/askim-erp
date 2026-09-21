'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appSetting } from '@/lib/db/schema'
import { canManageUsers, getSessionUser } from '@/server/auth/guards'
import { SETTING_KEYS } from '@/server/queries/app-settings'
import { audit } from '@/server/audit'

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
  await audit({ action: 'setting.update', targetType: 'setting', targetId: SETTING_KEYS.changeHighlightDays, summary: `거래 수정 표시 기간 → ${days}일`, detail: { days } })
  revalidatePath('/admin')
  revalidatePath('/deals')
  return { ok: true, days }
}

/** 팀장 조회 범위 저장 — admin 전용 */
export async function saveTeamLeadScope(raw: unknown): Promise<{ ok: true; scope: 'all' | 'team' } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canManageUsers(user.role)) return { error: '관리자만 변경할 수 있습니다' }
  const parsed = z.enum(['all', 'team']).safeParse(raw)
  if (!parsed.success) return { error: '잘못된 값' }
  const scope = parsed.data
  await db
    .insert(appSetting)
    .values({ key: SETTING_KEYS.teamLeadScope, value: scope, updatedBy: user.id })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: scope, updatedBy: user.id, updatedAt: new Date() } })
  await audit({ action: 'setting.update', targetType: 'setting', targetId: SETTING_KEYS.teamLeadScope, summary: `팀장 조회 범위 → ${scope === 'all' ? '전체' : '자기 팀만'}`, detail: { scope } })
  revalidatePath('/admin')
  revalidatePath('/deals')
  revalidatePath('/deposits')
  return { ok: true, scope }
}

/** 함께 보는 팀 묶음 저장 — admin 전용. 한 팀은 한 묶음에만 */
export async function saveTeamShareGroups(raw: unknown): Promise<{ ok: true; groups: string[][] } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canManageUsers(user.role)) return { error: '관리자만 변경할 수 있습니다' }
  const parsed = z.array(z.array(z.string().trim().min(1).max(40)).max(20)).max(10).safeParse(raw)
  if (!parsed.success) return { error: '잘못된 값' }
  const groups = parsed.data.map((g) => [...new Set(g)]).filter((g) => g.length > 0)
  if (groups.some((g) => g.length < 2)) return { error: '묶음에는 팀을 2개 이상 선택하세요' }
  const all = groups.flat()
  if (new Set(all).size !== all.length) return { error: '한 팀은 하나의 묶음에만 넣을 수 있습니다' }
  const value = JSON.stringify(groups)
  await db
    .insert(appSetting)
    .values({ key: SETTING_KEYS.teamShareGroups, value, updatedBy: user.id })
    .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedBy: user.id, updatedAt: new Date() } })
  await audit({ action: 'setting.update', targetType: 'setting', targetId: SETTING_KEYS.teamShareGroups, summary: `함께 보는 팀 묶음 → ${groups.length ? groups.map((g) => g.join('+')).join(' / ') : '없음'}`, detail: { groups } })
  revalidatePath('/admin')
  revalidatePath('/deals')
  revalidatePath('/deposits')
  return { ok: true, groups }
}
