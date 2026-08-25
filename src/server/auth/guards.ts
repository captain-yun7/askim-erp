import { auth } from '@/auth'

/**
 * 역할/행 단위 권한 헬퍼 (스펙 06_permissions 기준)
 *
 * - admin: 전체 권한
 * - accountant: 거래/거래처/판관비 전체 수정
 * - sales: 본인 거래·지출만, 상태 제약
 * - viewer: 조회만
 */
export type Role = 'admin' | 'accountant' | 'sales' | 'viewer'

export type SessionUser = {
  id: string
  role: Role
  name?: string
  email?: string
  team?: string
  isTeamLead?: boolean
}

/** 현재 로그인 유저 (없으면 null) */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    id: session.user.id,
    role: (session.user.role as Role) ?? 'viewer',
    name: session.user.name ?? undefined,
    email: session.user.email ?? undefined,
    team: session.user.team,
    isTeamLead: session.user.isTeamLead ?? false,
  }
}

const STAFF: Role[] = ['admin', 'accountant']

export const isStaff = (role: Role) => STAFF.includes(role)
export const isAdmin = (role: Role) => role === 'admin'
export const isViewer = (role: Role) => role === 'viewer'

// ── 메뉴/데이터 범위 (2026-08-25 회의 권한 체계) ─────────
// 관리자(회계+대표): 전체. 영업(sales): 거래·거래처·보증금 메뉴만,
// 팀장은 자기 팀 전체, 팀원은 본인 것만.

/** 판관비·리포트·대시보드 등 백오피스 메뉴 접근 */
export function canAccessBackoffice(role: Role): boolean {
  return role !== 'sales'
}

export type DealScope =
  | { kind: 'all' }
  | { kind: 'team'; team: string }
  | { kind: 'own'; userId: string }

/** 거래 행 단위 조회 범위 */
export function getDealScope(user: SessionUser): DealScope {
  if (isStaff(user.role) || user.role === 'viewer') return { kind: 'all' }
  if (user.isTeamLead && user.team) return { kind: 'team', team: user.team }
  return { kind: 'own', userId: user.id }
}

// ── Deal ────────────────────────────────────────────────
type DealRef = { status: 'draft' | 'confirmed' | 'closed'; ownerUserId: string | null }

export function canCreateDeal(role: Role): boolean {
  return role !== 'viewer'
}

/** 거래 일반 수정: 회계/admin 전체, 영업은 본인+closed 아님 */
export function canEditDeal(user: SessionUser, deal: DealRef): boolean {
  if (isStaff(user.role)) return true
  if (user.role === 'sales')
    return deal.ownerUserId === user.id && deal.status !== 'closed'
  return false
}

/** 금액(매출/매입/VAT) 변경: 회계/admin 전체, 영업은 본인+draft만 */
export function canEditDealAmounts(user: SessionUser, deal: DealRef): boolean {
  if (isStaff(user.role)) return true
  if (user.role === 'sales')
    return deal.ownerUserId === user.id && deal.status === 'draft'
  return false
}

/** 거래 soft delete: 회계/admin 전체, 영업은 본인+draft만 */
export function canDeleteDeal(user: SessionUser, deal: DealRef): boolean {
  if (isStaff(user.role)) return true
  if (user.role === 'sales')
    return deal.ownerUserId === user.id && deal.status === 'draft'
  return false
}

/** 성과급 컬럼 조회: 회계/admin 전체, 영업은 본인 것만 */
export function canViewCommission(user: SessionUser, deal: DealRef): boolean {
  if (isStaff(user.role)) return true
  return user.role === 'sales' && deal.ownerUserId === user.id
}

// ── Counterparty ────────────────────────────────────────
type CounterpartyRef = { createdBy: string | null }

export function canCreateCounterparty(role: Role): boolean {
  return role !== 'viewer'
}

/** 일반 필드(주소/메일/메모) 수정: 회계/admin 전체, 영업은 본인 등록건 */
export function canEditCounterparty(user: SessionUser, cp: CounterpartyRef): boolean {
  if (isStaff(user.role)) return true
  return user.role === 'sales' && cp.createdBy === user.id
}

/** 계좌정보(은행/계좌번호/예금주) 목록·CSV 노출: 회계/admin만 */
export function canViewBankInfo(role: Role): boolean {
  return isStaff(role)
}

/** 민감 필드(사업자번호/계좌/수수료) 수정: 회계/admin만 */
export function canEditCounterpartySensitive(role: Role): boolean {
  return isStaff(role)
}

export function canDeleteCounterparty(role: Role): boolean {
  return isStaff(role)
}

// ── Expense ─────────────────────────────────────────────
type ExpenseRef = { createdBy: string | null; payerUserId: string | null }

export function canCreateExpense(role: Role): boolean {
  return role !== 'viewer'
}

/** 판관비 수정: 회계/admin 전체, 영업은 본인 입력건 */
export function canEditExpense(user: SessionUser, exp: ExpenseRef): boolean {
  if (isStaff(user.role)) return true
  return (
    user.role === 'sales' &&
    (exp.createdBy === user.id || exp.payerUserId === user.id)
  )
}

// ── Plan (매출목표·현금흐름·연 목표) ─────────────────────
/** 목표/계좌잔액 수기 입력: 회계/admin만 */
export function canEditPlan(role: Role): boolean {
  return isStaff(role)
}

// ── Admin / Lookup ──────────────────────────────────────
export function canManageUsers(role: Role): boolean {
  return isAdmin(role)
}

export function canManageLookups(role: Role): boolean {
  return isAdmin(role)
}
