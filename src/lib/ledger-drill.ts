import type { LedgerReport } from '@/server/queries/reports-ledger'

/**
 * 매출장표 숫자의 근거 보기 (2026-10-06 요청).
 * 합계·차감으로 만들어지는 행은 "어떤 행을 더하고 빼서 나온 값인지"를 보여 주고,
 * 더 내려갈 수 없는 행(총매출·매출원가·판관비 과목)은 서버에서 거래·지출 목록을 가져온다.
 */
export type DrillPart = { key: string; sign: 1 | -1 }
export type DrillFormula = { parts: DrillPart[]; note?: string; factor?: number }

export function buildLedgerFormulas(report: LedgerReport): Record<string, DrillFormula> {
  const cats = (g: string) => report.categories.filter((c) => c.costGroup === g).map((c) => ({ key: `cat_${c.id}`, sign: 1 as const }))
  const minus = (parts: DrillPart[]) => parts.map((p) => ({ ...p, sign: -1 as const }))
  return {
    gross_cash: { parts: [{ key: 'sales_cash', sign: 1 }, { key: 'cogs_cash', sign: -1 }] },
    gross_accrual: { parts: [{ key: 'sales_accrual', sign: 1 }, { key: 'cogs_accrual', sign: -1 }] },
    op_cash: { parts: [{ key: 'gross_cash', sign: 1 }, { key: 'sgna', sign: -1 }] },
    op_accrual: { parts: [{ key: 'gross_accrual', sign: 1 }, { key: 'sgna', sign: -1 }] },
    sgna: { parts: [{ key: 'fixed', sign: 1 }, { key: 'variable', sign: 1 }] },
    fixed: { parts: cats('fixed') },
    variable: { parts: cats('variable') },
    net_cash: { parts: [{ key: 'op_cash', sign: 1 }, ...minus(cats('non_operating'))] },
    net_accrual: { parts: [{ key: 'op_accrual', sign: 1 }, ...minus(cats('non_operating'))] },
    tithe: { parts: [{ key: 'op_cash', sign: 1 }], factor: 0.1, note: '영업이익(통장) × 10%' },
  }
}

/** 서버에서 목록을 가져오는 행의 집계 기준 설명 */
export const LEAF_BASIS: Record<string, string> = {
  sales_cash: '입금일이 이 달이고 입금여부가 완료인 거래 · 총매출(VAT 포함)',
  sales_accrual: '귀속월이 이 달인 거래 · 총매출(VAT 포함)',
  cogs_cash: '지급일이 이 달이고 결산여부가 완료인 거래 · 총매입(VAT 포함)',
  cogs_accrual: '귀속월이 이 달인 거래 · 총매입(VAT 포함)',
  col_sales_planned: '입금예정일이 이 달인 거래 · 총매출(VAT 포함)',
  col_sales_collected: '입금일이 이 달이고 입금여부가 완료인 거래 · 총매출(VAT 포함)',
  col_sales_outstanding: '입금예정일이 이 달인데 아직 입금 완료가 아닌 거래 · 총매출(VAT 포함)',
  col_purchase_planned: '결산연월(없으면 결산예정일)이 이 달인 거래 · 총매입(VAT 포함)',
  col_purchase_settled: '지급일이 이 달이고 결산여부가 완료인 거래 · 총매입(VAT 포함)',
  col_purchase_outstanding: '결산연월(없으면 결산예정일)이 이 달인데 아직 결산 완료가 아닌 거래 · 총매입(VAT 포함)',
}

export type DrillDealRow = {
  id: string
  dealCode: string
  accrual: string
  owner: string | null
  issuer: string | null
  supplier: string | null
  itemName: string | null
  /** 이 칸에 잡힌 근거 날짜 (입금일·지급일·예정일·귀속월) */
  basisDate: string | null
  status: string | null
  net: number
  vat: number
  amount: number
}

export type DrillExpenseRow = {
  id: string
  date: string
  itemName: string | null
  counterparty: string | null
  category: string | null
  amount: number
}

export type DrillDetail =
  | { kind: 'deals'; basis: string; side: 'sales' | 'purchase'; dateLabel: string; rows: DrillDealRow[]; total: number }
  | { kind: 'expenses'; basis: string; rows: DrillExpenseRow[]; total: number }

/** 금액 합계 — 소수 둘째 자리까지라 전 단위 정수로 더해야 표의 값(DB 합계)과 1원도 어긋나지 않는다 */
export const sumAmounts = (values: number[]) => values.reduce((a, v) => a + Math.round(v * 100), 0) / 100
