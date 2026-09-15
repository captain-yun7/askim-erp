import { headers } from 'next/headers'
import { db } from '@/lib/db/client'
import { auditLog } from '@/lib/db/schema'
import { getSessionUser, type SessionUser } from '@/server/auth/guards'

/** 행위 코드 → 화면 표시 라벨 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'auth.login': '로그인',
  'auth.login_failed': '로그인 실패',
  'auth.logout': '로그아웃',
  'deal.create': '거래 등록',
  'deal.update': '거래 수정',
  'deal.delete': '거래 삭제',
  'deal.paid_toggle': '입금/결산 토글',
  'deal.inline': '거래 인라인 수정',
  'counterparty.create': '거래처 등록',
  'counterparty.update': '거래처 수정',
  'counterparty.delete': '거래처 비활성화',
  'expense.create': '판관비 등록',
  'expense.upload': '판관비 엑셀 업로드',
  'expense.update': '판관비 수정',
  'expense.delete': '판관비 삭제',
  'deposit.save': '보증금 저장',
  'deposit.delete': '보증금 삭제',
  'contract.save': '전속계약/보유자산 저장',
  'contract.delete': '전속계약/보유자산 삭제',
  'attachment.upload': '첨부 올리기',
  'attachment.delete': '첨부 삭제',
  'attachment.view': '첨부 열람',
  'user.create': '사용자 등록',
  'user.role': '사용자 역할 변경',
  'user.team': '사용자 팀 변경',
  'user.team_lead': '팀장 지정/해제',
  'user.active': '사용자 활성/비활성',
  'user.reset_password': '비밀번호 초기화',
  'profile.update': '내 프로필 변경',
  'lookup.update': '마스터 수정',
  'plan.save': '매출목표/잔액 저장',
  'setting.update': '설정 변경',
  'export.csv': 'CSV 내보내기',
  'export.xlsx': '엑셀 다운로드',
}

type AuditInput = {
  action: keyof typeof AUDIT_ACTION_LABEL | (string & {})
  summary: string
  targetType?: string
  targetId?: string | number | null
  targetLabel?: string | null
  detail?: unknown
  /** 세션이 없을 때(로그인 실패 등) 주체를 직접 지정 */
  actor?: Pick<SessionUser, 'id' | 'name' | 'role'> | null
}

/** 감사 로그 1건 기록 — 본 작업을 막지 않도록 실패해도 던지지 않음 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const actor = input.actor === undefined ? await getSessionUser() : input.actor
    let ip: string | null = null
    try {
      const h = await headers()
      ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim() || null
    } catch {
      /* 요청 컨텍스트 밖 */
    }
    await db.insert(auditLog).values({
      userId: actor?.id ?? null,
      userName: actor?.name ?? null,
      userRole: actor?.role ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId == null ? null : String(input.targetId),
      targetLabel: input.targetLabel ?? null,
      summary: input.summary,
      detail: input.detail ?? null,
      ip,
    })
  } catch (e) {
    console.error('[audit] 기록 실패', e)
  }
}

/** 변경 전/후 diff — 바뀐 필드만 { field: [before, after] } */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, [unknown, unknown]> {
  const norm = (v: unknown) => (v == null || v === '' ? null : typeof v === 'number' ? String(v) : /^-?\d+(\.\d+)?$/.test(String(v)) ? String(Number(v)) : String(v))
  const out: Record<string, [unknown, unknown]> = {}
  for (const k of Object.keys(after)) {
    if (!(k in before) || after[k] === undefined) continue
    if (norm(before[k]) !== norm(after[k])) out[k] = [before[k] ?? null, after[k] ?? null]
  }
  return out
}
