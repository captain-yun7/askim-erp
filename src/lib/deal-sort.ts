/** 거래 목록 정렬 기준 (2026-09-15 고객 확정: 기본 작성순, 귀속월·입금일·거래코드 등 선택) — 클라이언트에서도 쓰므로 DB 의존 없음 */
export type DealSort = 'created' | 'accrual' | 'salesPaid' | 'salesDue' | 'purchasePaid' | 'code' | 'sales' | 'profit'

export const DEAL_SORT_LABEL: Record<DealSort, string> = {
  created: '작성순',
  accrual: '귀속월순',
  salesPaid: '입금일순',
  salesDue: '입금예정일순',
  purchasePaid: '결산일순',
  code: '거래코드순',
  sales: '매출순',
  profit: '손익순',
}
