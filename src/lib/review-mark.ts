/**
 * 수정요청/완료 표시 권한 (2026-10-12 요청: 실수로 누르는 것 방지).
 * - 수정요청 걸기·요청취소(표시 지우기, 2026-10-13 이름 변경): 관리자만
 * - 수정완료 처리: 그 거래 담당자 본인 또는 관리자 (수정요청이 걸린 거래만)
 */
export type ReviewStatus = 'requested' | 'done' | null

export const REVIEW_LABEL: Record<'requested' | 'done', string> = { requested: '수정요청', done: '수정완료' }

export function reviewChoices(current: ReviewStatus, who: { admin: boolean; owner: boolean }): ReviewStatus[] {
  if (who.admin) return (['requested', 'done', null] as ReviewStatus[]).filter((s) => s !== current)
  if (who.owner && current === 'requested') return ['done']
  return []
}
