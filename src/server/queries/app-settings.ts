import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSetting } from '@/lib/db/schema'
import { CHANGE_HIGHLIGHT_DAYS_DEFAULT } from '@/lib/change-highlight'

export const SETTING_KEYS = {
  changeHighlightDays: 'change_highlight_days',
} as const

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, key)).limit(1)
  return row?.value ?? null
}

/** 최근 수정 칸 음영 기간(일) — 관리자 설정, 없으면 기본값 */
export async function getChangeHighlightDays(): Promise<number> {
  const v = Number(await getSetting(SETTING_KEYS.changeHighlightDays))
  return Number.isInteger(v) && v >= 1 && v <= 365 ? v : CHANGE_HIGHLIGHT_DAYS_DEFAULT
}
