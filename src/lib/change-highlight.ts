/**
 * 최근 수정 칸 음영 (2026-09-09 피드백) — 기간은 관리자 설정(app_setting.change_highlight_days), 없으면 이 기본값
 */
export const CHANGE_HIGHLIGHT_DAYS_DEFAULT = 30

/** 거래 목록 컬럼 ↔ 추적 필드 매핑 */
export const LIST_COLUMN_FIELDS = {
  code: ['dealCode', 'currency', 'status'],
  accrual: ['accrualYear', 'accrualMonth'],
  category: ['categoryId', 'accountId'],
  owner: ['ownerUserId'],
  issuer: ['issuerCounterpartyId', 'advertiserName', 'advertiserCounterpartyId', 'itemName', 'adStart', 'adEnd', 'salesMethodId', 'salesMemo'],
  supplier: ['supplierCounterpartyId', 'purchasePricingRaw', 'settlementYear', 'settlementMonth', 'purchaseMemo'],
  salesNet: ['salesAmountNet', 'salesAmountGross'],
  salesVat: ['salesVat'],
  purchaseNet: ['purchaseAmountNet', 'purchaseAmountGross'],
  purchaseVat: ['purchaseVat'],
  paid: ['salesPaidStatus', 'purchasePaidStatus'],
  salesInvoice: ['salesInvoiceDate'],
  purchaseInvoice: ['purchaseInvoiceDate'],
  salesDates: ['salesDueDate', 'salesPaidDate'],
  purchaseDates: ['purchaseDueDate', 'purchasePaidDate'],
} as const

export type RecentChange = { changedAt: string; changedBy: string | null }
/** field → 가장 최근 변경 */
export type RecentChanges = Record<string, RecentChange>

export function columnChange(changes: RecentChanges | undefined, column: keyof typeof LIST_COLUMN_FIELDS): RecentChange | null {
  if (!changes) return null
  let best: RecentChange | null = null
  for (const f of LIST_COLUMN_FIELDS[column]) {
    const c = changes[f]
    if (c && (!best || c.changedAt > best.changedAt)) best = c
  }
  return best
}

export function changeTitle(c: RecentChange): string {
  const days = Math.floor((Date.now() - new Date(c.changedAt).getTime()) / 86_400_000)
  const when = days <= 0 ? '오늘' : `${days}일 전`
  return `${when} 수정${c.changedBy ? ` · ${c.changedBy}` : ''}`
}
