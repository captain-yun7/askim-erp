/** 매출목표 그룹 — 엑셀 '26년 plan' 시트의 구분. 상품구분(deal_category.plan_group) N:1 매핑 */
export const PLAN_GROUPS = [
  { code: 'exclusive',       label: '에스킴 전속매체(외벽 외)' },
  { code: 'outwall_seongsu', label: '성수동 기존 외벽광고' },
  { code: 'outwall_other',   label: '성수동 外 외벽광고' },
  { code: 'han_river_bus',   label: '한강버스' },
  { code: 'overseas',        label: '해외매체 세일즈' },
  { code: 'sales_agency',    label: '영업대행' },
  { code: 'fanclub',         label: '팬클럽 매체' },
  { code: 'china',           label: '중국사업' },
] as const

export type PlanGroupCode = (typeof PLAN_GROUPS)[number]['code']
export const PLAN_GROUP_CODES = PLAN_GROUPS.map((g) => g.code) as [PlanGroupCode, ...PlanGroupCode[]]
export const PLAN_GROUP_LABEL = Object.fromEntries(PLAN_GROUPS.map((g) => [g.code, g.label])) as Record<PlanGroupCode, string>

export const PRIORITIES = ['상', '중', '하'] as const
export type Priority = (typeof PRIORITIES)[number]
