import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSetting } from '@/lib/db/schema'
import { CHANGE_HIGHLIGHT_DAYS_DEFAULT } from '@/lib/change-highlight'

export const SETTING_KEYS = {
  changeHighlightDays: 'change_highlight_days',
  teamLeadScope: 'team_lead_scope',
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

export type TeamLeadScope = 'all' | 'team'

/** 팀장의 거래·보증금 조회 범위 — 'all' 전체(기본, 2026-09-07 고객 정의) | 'team' 자기 팀만 */
export async function getTeamLeadScope(): Promise<TeamLeadScope> {
  return (await getSetting(SETTING_KEYS.teamLeadScope)) === 'team' ? 'team' : 'all'
}
