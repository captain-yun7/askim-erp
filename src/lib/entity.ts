/**
 * 법인 (2026-10-08 요청): 한국법인 기본, 미국·중국법인은 데이터가 섞이지 않게 따로 본다.
 * 현재 법인은 쿠키 `askim-entity` 로 전달하고, 거래·거래처·판관비·보증금·계획 표의 `entity` 컬럼으로 나눈다.
 */
export const ENTITIES = [
  { code: 'kr', label: '한국법인', short: 'KR', currency: 'KRW', hasVat: true },
  { code: 'us', label: '미국법인', short: 'US', currency: 'USD', hasVat: false },
  { code: 'cn', label: '중국법인', short: 'CN', currency: 'CNY', hasVat: false },
] as const

export type Entity = (typeof ENTITIES)[number]['code']
export const DEFAULT_ENTITY: Entity = 'kr'
export const ENTITY_COOKIE = 'askim-entity'

export const isEntity = (v: unknown): v is Entity => typeof v === 'string' && ENTITIES.some((e) => e.code === v)
export const entityInfo = (code: Entity) => ENTITIES.find((e) => e.code === code) ?? ENTITIES[0]
