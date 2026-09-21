import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSetting } from '@/lib/db/schema'
import { CHANGE_HIGHLIGHT_DAYS_DEFAULT } from '@/lib/change-highlight'

export const SETTING_KEYS = {
  changeHighlightDays: 'change_highlight_days',
  teamLeadScope: 'team_lead_scope',
  teamShareGroups: 'team_share_groups',
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

/**
 * 함께 보는 팀 묶음 (2026-09-21 요청: 해외영업팀·중국사업부가 서로의 거래를 조회·수정).
 * 같은 묶음에 속한 팀의 영업 계정은 팀장 여부와 무관하게 묶음 안 거래·보증금을 조회하고 거래를 수정할 수 있다.
 * 저장 형식: JSON `[["해외영업","중국사업부"], ...]`
 */
export async function getTeamShareGroups(): Promise<string[][]> {
  const raw = await getSetting(SETTING_KEYS.teamShareGroups)
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v
      .filter((g): g is unknown[] => Array.isArray(g))
      .map((g) => [...new Set(g.filter((t): t is string => typeof t === 'string' && t.trim() !== ''))])
      .filter((g) => g.length >= 2)
  } catch {
    return []
  }
}

/** 이 팀과 묶인 팀들(자기 팀 포함). 묶음이 없으면 빈 배열 */
export function shareTeamsOf(groups: string[][], team: string | null | undefined): string[] {
  if (!team) return []
  return groups.find((g) => g.includes(team)) ?? []
}
