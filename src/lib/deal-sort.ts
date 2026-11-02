/**
 * 거래 목록 정렬 기준 (2026-09-15 고객 확정: 기본 작성순, 귀속월·입금일·거래코드 등 선택)
 * 2026-11-02 요청: 오름·내림차순을 모든 항목에 — 표의 칸마다 정렬 기준을 두고 칸 제목을 눌러도 정렬된다.
 * 클라이언트에서도 쓰므로 DB 의존 없음
 */
export type DealSort =
  | 'created'
  | 'code'
  | 'accrual'
  | 'category'
  | 'owner'
  | 'issuer'
  | 'supplier'
  | 'item'
  | 'sales'
  | 'salesVat'
  | 'salesGross'
  | 'purchase'
  | 'purchaseVat'
  | 'purchaseGross'
  | 'salesMethod'
  | 'salesInvoice'
  | 'purchaseInvoice'
  | 'salesDue'
  | 'salesPaid'
  | 'settlement'
  | 'purchasePaid'
  | 'profit'
  | 'incentiveRate'
  | 'incentive'

export const DEAL_SORT_LABEL: Record<DealSort, string> = {
  created: '작성순',
  code: '거래코드순',
  accrual: '귀속월순',
  category: '상품구분순',
  owner: '담당순',
  issuer: '발행처순',
  supplier: '매체사순',
  item: '품목명순',
  sales: '매출순',
  salesVat: '매출 부가세순',
  salesGross: '총매출순',
  purchase: '매입순',
  purchaseVat: '매입 부가세순',
  purchaseGross: '총매입순',
  salesMethod: '매출수단순',
  salesInvoice: '매출계산서 발행일순',
  purchaseInvoice: '매입계산서 발행일순',
  salesDue: '입금예정일순',
  salesPaid: '입금일순',
  settlement: '결산연월일순',
  purchasePaid: '결산일순',
  profit: '손익순',
  incentiveRate: '인센티브(%)순',
  incentive: '성과급순',
}
