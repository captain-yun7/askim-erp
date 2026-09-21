import { getDealScope, type DealScope, type SessionUser } from '@/server/auth/guards'
import { getTeamLeadScope } from '@/server/queries/app-settings'

/**
 * 관리자 설정을 반영한 거래 조회 범위 (2026-09-16 피드백: 팀장 조회 범위를 관리자가 설정).
 * 팀장 + 설정 '자기 팀만' → 같은 팀 담당자 거래. 팀이 비어 있으면 본인 것만.
 */
export async function resolveDealScope(user: SessionUser): Promise<DealScope> {
  const base = getDealScope(user)
  if (user.role !== 'sales' || !user.isTeamLead) return base
  if ((await getTeamLeadScope()) === 'all') return { kind: 'all' }
  return user.team ? { kind: 'team', team: user.team } : { kind: 'own', userId: user.id }
}
