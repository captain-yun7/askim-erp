/** 판관비 과목 그룹 — 매출장표(엑셀) 구조 기준 */
export const COST_GROUPS = ['fixed', 'variable', 'non_operating', 'excluded'] as const
export type CostGroup = (typeof COST_GROUPS)[number]

export const COST_GROUP_LABEL: Record<CostGroup, string> = {
  fixed: '고정비',
  variable: '변동비',
  non_operating: '판관비 외(세금 등)',
  excluded: '리포트 제외',
}
