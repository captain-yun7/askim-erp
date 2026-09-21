import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { canEditDeal, getDealScope, type DealScope, type SessionUser } from '@/server/auth/guards'
import { getTeamLeadScope, getTeamShareGroups, shareTeamsOf } from '@/server/queries/app-settings'

/**
 * 관리자 설정을 반영한 거래 조회 범위.
 *   - 팀장 + '전체' → 전체 / 팀장 + '자기 팀만' → 자기 팀 (2026-09-16)
 *   - 함께 보는 팀 묶음에 속한 팀 → 팀장 여부와 무관하게 묶음 안 팀 전부 (2026-09-21)
 *   - 그 외 영업 → 본인 것만
 */
export async function resolveDealScope(user: SessionUser): Promise<DealScope> {
  const base = getDealScope(user)
  if (user.role !== 'sales') return base
  const [leadScope, groups] = await Promise.all([user.isTeamLead ? getTeamLeadScope() : null, getTeamShareGroups()])
  if (user.isTeamLead && leadScope === 'all') return { kind: 'all' }
  const teams = new Set(shareTeamsOf(groups, user.team))
  if (user.isTeamLead && user.team) teams.add(user.team)
  return teams.size ? { kind: 'team', teams: [...teams] } : { kind: 'own', userId: user.id }
}

/** 현재 사용자와 거래를 함께 수정하는 팀들 (묶음에 속하지 않으면 빈 배열) */
export async function getShareTeams(user: SessionUser): Promise<string[]> {
  if (user.role !== 'sales' || !user.team) return []
  return shareTeamsOf(await getTeamShareGroups(), user.team)
}

type DealRef = { status: 'draft' | 'confirmed' | 'closed'; ownerUserId: string | null }

/** 목록처럼 담당자 팀을 이미 아는 경우의 동기 판정 */
export function canEditDealShared(user: SessionUser, deal: DealRef, ownerTeam: string | null | undefined, shareTeams: string[]): boolean {
  if (canEditDeal(user, deal)) return true
  return user.role === 'sales' && ownerTeam != null && shareTeams.includes(ownerTeam)
}

/** 거래 수정 권한 — 본인 거래 + 같은 묶음 팀의 거래 (2026-09-21: 해외영업팀·중국사업부 상호 수정) */
export async function canEditDealScoped(user: SessionUser, deal: DealRef): Promise<boolean> {
  if (canEditDeal(user, deal)) return true
  if (user.role !== 'sales' || !deal.ownerUserId) return false
  const shareTeams = await getShareTeams(user)
  if (!shareTeams.length) return false
  const [owner] = await db.select({ team: users.team }).from(users).where(eq(users.id, deal.ownerUserId)).limit(1)
  return owner?.team != null && shareTeams.includes(owner.team)
}
