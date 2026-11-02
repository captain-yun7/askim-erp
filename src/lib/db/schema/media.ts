import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * 매체관리 (2026-11-02 요청) — 엑셀 '광고매체_회사보관용_v2' + 지운님 '임대인 시트 정리' 기준.
 * 한 칸에 여러 개 들어가던 가격·담당자·시공사는 줄 단위 하위 표로, 지역·계약종류·시공사는 목록에서 고른다.
 */
export const media = pgTable(
  'media',
  {
    id: serial('id').primaryKey(),
    entity: text('entity').notNull().default('kr'),
    /** 매체번호 M + 등록 연월(YYMM) + 순번 4자리 — 예: M26100007 */
    code: text('code').notNull(),
    category: text('category'),
    regionCity: text('region_city'),
    regionDistrict: text('region_district'),
    regionArea: text('region_area'),
    name: text('name').notNull(),
    /** 엑셀에 적혀 있던 원래 이름 (PDF: 원래 이름은 옆 칸에 보관) */
    nameOriginal: text('name_original'),
    contractType: text('contract_type'),
    contractStart: date('contract_start'),
    contractEnd: date('contract_end'),
    /** 계약기간 원문 — 날짜로 못 바꾼 내용 확인용 */
    contractNote: text('contract_note'),
    /** 사내 담당 중 직원 목록에 없는 것 (예: 영업팀) */
    staffNote: text('staff_note'),
    runPeriod: text('run_period'),
    status: text('status').notNull().default('운영 중'),
    memo: text('memo'),
    /** 가져올 때의 엑셀 행 그대로 — 나눠 넣은 값 대조용 */
    source: jsonb('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('media_code_uq').on(t.entity, t.code).where(sql`${t.deletedAt} IS NULL`)],
)

/** 가격 줄 — 엑셀의 판매가·입금가·건물주 매입가·제작 판매가·제작 입금가 칸을 면·기간별 한 줄씩 */
export const MEDIA_PRICE_TYPES = ['sale', 'net', 'landlord', 'prod_sale', 'prod_net'] as const
export type MediaPriceType = (typeof MEDIA_PRICE_TYPES)[number]

export const mediaPrice = pgTable(
  'media_price',
  {
    id: serial('id').primaryKey(),
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    type: text('type', { enum: MEDIA_PRICE_TYPES }).notNull(),
    /** 면·기간 — 예: 정면, 정면+측면, 2주 */
    label: text('label'),
    /** 원 단위, 부가세 별도. 금액이 없는 줄(예: 20% 포함가)은 null */
    amount: numeric('amount', { precision: 15, scale: 0 }),
    /** '전후' 같은 대략 금액 */
    approx: boolean('approx').notNull().default(false),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('media_price_media_idx').on(t.mediaId)],
)

/** 매체 담당자(건물주·대행 측) — 사람마다 한 줄 */
export const mediaContact = pgTable(
  'media_contact',
  {
    id: serial('id').primaryKey(),
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    name: text('name'),
    title: text('title'),
    company: text('company'),
    phone: text('phone'),
    phone2: text('phone2'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('media_contact_media_idx').on(t.mediaId)],
)

/** 사내 담당 직원 */
export const mediaStaff = pgTable(
  'media_staff',
  {
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('media_staff_uq').on(t.mediaId, t.userId)],
)

/** 시공사 — 업체 목록에서 고르고, 둘이면 두 줄 */
export const mediaVendor = pgTable(
  'media_vendor',
  {
    id: serial('id').primaryKey(),
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('media_vendor_media_idx').on(t.mediaId)],
)

/** 고를 수 있는 목록 — 구분·지역(시 → 구 → 동네)·계약종류·시공사·관리 상태 */
export const MEDIA_OPTION_KINDS = ['category', 'region', 'contract_type', 'vendor', 'status'] as const
export type MediaOptionKind = (typeof MEDIA_OPTION_KINDS)[number]

export const mediaOption = pgTable(
  'media_option',
  {
    id: serial('id').primaryKey(),
    entity: text('entity').notNull().default('kr'),
    kind: text('kind', { enum: MEDIA_OPTION_KINDS }).notNull(),
    value: text('value').notNull(),
    /** 지역만 — 구의 부모는 시, 동네의 부모는 구 */
    parentId: integer('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('media_option_uq').on(t.entity, t.kind, t.value, sql`coalesce(${t.parentId}, 0)`)],
)

export type Media = typeof media.$inferSelect
export type MediaPrice = typeof mediaPrice.$inferSelect
export type MediaContact = typeof mediaContact.$inferSelect
export type MediaVendor = typeof mediaVendor.$inferSelect
export type MediaOption = typeof mediaOption.$inferSelect
