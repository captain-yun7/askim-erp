import { sql } from 'drizzle-orm'
import { deal } from '@/lib/db/schema'

/**
 * 결산인데 결산일이 '-' 인 거래 = 고정비로 이미 비용 처리돼 실제로 나가지 않는 매입 (2026-11-09·17 요청).
 * 인센티브 계산용으로만 거래에 금액을 남겨 두므로, 합계·리포트에서는 매입을 빼고 손익은 그만큼 되돌린다.
 * 통장(결산일) 기준 집계는 결산일이 없어 원래 빠진다.
 */
export const fixedCostSettled = sql`(${deal.purchasePaidStatus} = 'completed' and ${deal.purchasePaidDate} is null)`

/** 합계에 넣을 매입 조건 */
export const countsAsPurchase = sql`not ${fixedCostSettled}`

/** 손익 합계 — 거래 손익 합 + 뺀 매입(공급가) */
export const profitSum = sql`(coalesce(sum(${deal.profit}), 0) + coalesce(sum(${deal.purchaseAmountNet}) filter (where ${fixedCostSettled}), 0))`
