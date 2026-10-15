'use server'

import { revalidatePath } from 'next/cache'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { getCurrentEntity } from '@/server/entity'
import { entityInfo } from '@/lib/entity'
import { deal, reviewRequestLog, users } from '@/lib/db/schema'
import {
  canCreateDeal,
  canDeleteDeal,
  getSessionUser,
  isAdmin,
  isStaff,
  type SessionUser,
} from '@/server/auth/guards'
import { fetchKrwRate } from '@/server/fx'
import { reviewChoices, REVIEW_LABEL } from '@/lib/review-mark'
import { canEditDealScoped } from '@/server/auth/deal-scope'
import { recordDealChanges } from '@/server/deal-changes'
import { getInlineRow, type InlineRow } from '@/server/queries/deals'
import { audit, diffFields } from '@/server/audit'

const AMOUNT_FIELDS = [
  'salesAmountNet',
  'salesVat',
  'salesAmountGross',
  'purchaseAmountNet',
  'purchaseVat',
  'purchaseAmountGross',
] as const

/** numeric 문자열 비교 (null/포맷 차이 무시) */
function numEq(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  const na = a === null || a === undefined || a === '' ? null : Number(a)
  const nb = b === null || b === undefined || b === '' ? null : Number(b)
  if (na === null && nb === null) return true
  return na === nb
}

const dateSchema = z
  .union([z.string(), z.null(), z.literal('')])
  .transform((v) => (v && v !== '' ? v : null))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable())

const numStrSchema = z
  .union([z.string(), z.number(), z.null(), z.literal('')])
  .transform((v) => {
    if (v === '' || v === null || v === undefined) return null
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
    return isNaN(n) ? null : n.toString()
  })

const dealSchema = z.object({
  // 등록 시 필수 (2026-09-17 피드백: 자동 채번 폐지 — 고객사 자체 코드 체계 사용). 수정 시 비우면 기존 코드 유지
  dealCode: z
    .union([z.string(), z.null()])
    .transform((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined))
    .optional(),
  accrualYear: z.coerce.number().int().min(2000).max(2100),
  accrualMonth: z.coerce.number().int().min(1).max(12),
  ownerUserId: z.string().uuid().nullable().optional(),
  categoryId: z.coerce.number().int().nullable().optional(),
  accountId: z.coerce.number().int().nullable().optional(),
  currency: z.enum(['KRW', 'USD', 'CNY']).default('KRW'),
  // 원화 환율 (2026-10-12 요청) — 비우면 매출 입금일 기준으로 자동 조회
  fxRate: numStrSchema.optional(),
  status: z.enum(['draft', 'confirmed', 'closed']).default('draft'),
  // 매출
  salesMethodId: z.coerce.number().int().nullable().optional(),
  issuerCounterpartyId: z.string().uuid().nullable().optional(),
  advertiserCounterpartyId: z.string().uuid().nullable().optional(),
  advertiserName: z.string().trim().optional().nullable(),
  itemName: z.string().trim().optional().nullable(),
  adStart: dateSchema.optional(),
  adEnd: dateSchema.optional(),
  salesAmountNet: numStrSchema.optional(),
  salesVat: numStrSchema.optional(),
  salesAmountGross: numStrSchema.optional(),
  salesDueDate: dateSchema.optional(),
  salesPaidDate: dateSchema.optional(),
  salesPaidStatus: z.enum(['pending', 'partial', 'completed']).default('pending'),
  salesInvoiceDate: dateSchema.optional(),
  salesMemo: z.string().trim().optional().nullable(),
  // 매입
  supplierCounterpartyId: z.string().uuid().nullable().optional(),
  // 결산연도를 '26' 처럼 두 자리로 넣은 거래가 운영에 6건 있었다 (2026-10-08) → 2000년대로 보정
  settlementYear: z.coerce.number().int().nullable().optional().transform((v) => (v != null && v >= 0 && v < 100 ? 2000 + v : v)),
  settlementMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  purchasePricingRaw: z.string().trim().optional().nullable(),
  purchaseAmountNet: numStrSchema.optional(),
  purchaseVat: numStrSchema.optional(),
  purchaseAmountGross: numStrSchema.optional(),
  purchaseDueDate: dateSchema.optional(),
  purchasePaidDate: dateSchema.optional(),
  purchasePaidStatus: z.enum(['pending', 'partial', 'completed']).default('pending'),
  purchaseInvoiceDate: dateSchema.optional(),
  purchaseMemo: z.string().trim().optional().nullable(),
  commissionPct: numStrSchema.optional(),
  commissionAmount: numStrSchema.optional(),
  // 손익 수동 조정 (2026-10-15 요청) — 비우면 매출−매입 자동
  profitAdjusted: numStrSchema.optional(),
  profitAdjustMemo: z.string().trim().nullable().transform((v) => v || null).optional(),
})

export type DealInput = z.infer<typeof dealSchema>

/**
 * 외화 거래의 환율 자동 채움 (2026-10-12 요청: 매출 입금일 기준).
 * 환율 칸이 비었거나, 입금일이 바뀌었는데 환율은 그대로면 입금일 환율로 다시 받는다. 손으로 고친 환율은 건드리지 않는다.
 */
async function autoFxRate(
  next: { currency: string; salesPaidDate?: string | null; fxRate?: string | null },
  prev?: { salesPaidDate: string | null; fxRate: string | null },
): Promise<string | null | undefined> {
  if (next.currency === 'KRW' || !next.salesPaidDate) return next.fxRate
  const dateChanged = prev != null && prev.salesPaidDate !== next.salesPaidDate
  const rateUntouched = prev != null && numEq(next.fxRate, prev.fxRate)
  if (next.fxRate != null && !(dateChanged && rateUntouched)) return next.fxRate
  const rate = await fetchKrwRate(next.currency, next.salesPaidDate)
  return rate != null ? rate.toFixed(4) : next.fxRate
}

/** 폼에서 입금일을 고르면 바로 환율을 보여 주려고 (2026-10-12) */
export async function lookupFxRate(currency: unknown, date: unknown): Promise<{ rate: number | null }> {
  const user = await getSessionUser()
  if (!user || typeof currency !== 'string' || typeof date !== 'string') return { rate: null }
  return { rate: await fetchKrwRate(currency, date) }
}

export async function createDeal(raw: unknown) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canCreateDeal(user.role)) return { error: '거래 등록 권한이 없습니다' }
  const parsed = dealSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }
  const data = parsed.data
  // 영업은 본인 거래만 등록 (담당자 강제)
  if (user.role === 'sales') data.ownerUserId = user.id
  const manualCode = data.dealCode?.trim() || null
  if (!manualCode) return { error: '거래코드를 입력하세요' }
  const entity = await getCurrentEntity()
  const ent = entityInfo(entity)
  // 미국·중국법인 (2026-10-12): 통화를 안 정했으면 법인 통화, 부가세·계산서 발행일 없음 (목록 간단 추가도 여기로 온다)
  if (!ent.hasVat) {
    const sent = (raw as { currency?: unknown } | null)?.currency
    if (sent == null || sent === '') data.currency = ent.currency
    data.salesVat = null
    data.purchaseVat = null
    data.salesAmountGross = data.salesAmountNet ?? null
    data.purchaseAmountGross = data.purchaseAmountNet ?? null
    data.salesInvoiceDate = null
    data.purchaseInvoiceDate = null
  }
  data.fxRate = await autoFxRate(data)

  try {
    const row = await db.transaction(async (tx) => {
      const dealCode = manualCode
      const [r] = await tx
        .insert(deal)
        .values({
          ...data,
          entity,
          dealCode,
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning({ id: deal.id, dealCode: deal.dealCode })
      return r
    })
    revalidatePath('/deals')
    await audit({ action: 'deal.create', targetType: 'deal', targetId: row.id, targetLabel: row.dealCode, summary: `거래 등록 ${row.dealCode}` })
    return { ok: true, deal: row }
  } catch (e) {
    if (e instanceof Error && e.message.includes('unique')) {
      return { error: `거래코드 중복: ${manualCode}` }
    }
    return { error: e instanceof Error ? e.message : '저장 실패' }
  }
}

export async function updateDeal(id: string, raw: unknown) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const parsed = dealSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }

  const [existing] = await db.select().from(deal).where(eq(deal.id, id)).limit(1)
  if (!existing) return { error: '거래를 찾을 수 없습니다' }

  if (!(await canEditDealScoped(user, existing))) return { error: '이 거래를 수정할 권한이 없습니다' }

  if (parsed.data.dealCode && parsed.data.dealCode !== existing.dealCode) {
    const [dup] = await db.select({ id: deal.id }).from(deal).where(and(eq(deal.entity, await getCurrentEntity()), eq(deal.dealCode, parsed.data.dealCode), isNull(deal.deletedAt))).limit(1)
    if (dup && dup.id !== id) return { error: `거래코드 중복: ${parsed.data.dealCode} 은(는) 이미 있는 코드입니다` }
  }

  // 금액 변경 권한 확인
  const amountChanged = AMOUNT_FIELDS.some(
    (f) => !numEq(parsed.data[f], existing[f]),
  )
  if (amountChanged && !(await canEditDealScoped(user, existing))) {
    return { error: '금액을 변경할 권한이 없습니다' }
  }

  // 영업은 본인 거래를 closed 로 전이 불가
  if (user.role === 'sales' && parsed.data.status === 'closed') {
    return { error: '거래 완료 처리는 회계만 가능합니다' }
  }

  parsed.data.fxRate = await autoFxRate(parsed.data, existing)
  await db
    .update(deal)
    .set({ ...parsed.data, updatedBy: user.id })
    .where(eq(deal.id, id))
  await recordDealChanges(id, existing, parsed.data, user.id)
  const changed = diffFields(existing as Record<string, unknown>, parsed.data as Record<string, unknown>)
  await audit({ action: 'deal.update', targetType: 'deal', targetId: id, targetLabel: existing.dealCode, summary: `거래 수정 ${existing.dealCode} (${Object.keys(changed).length}개 항목)`, detail: changed })
  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
  return { ok: true }
}

export async function deleteDeal(id: string) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  const [existing] = await db
    .select({ status: deal.status, ownerUserId: deal.ownerUserId, dealCode: deal.dealCode })
    .from(deal)
    .where(eq(deal.id, id))
    .limit(1)
  if (!existing) return { error: '거래를 찾을 수 없습니다' }
  if (!canDeleteDeal(user, existing)) {
    return { error: '이 거래를 삭제할 권한이 없습니다' }
  }

  await db
    .update(deal)
    .set({ deletedAt: new Date(), updatedBy: user.id })
    .where(eq(deal.id, id))
  await audit({ action: 'deal.delete', targetType: 'deal', targetId: id, targetLabel: existing.dealCode, summary: `거래 삭제 ${existing.dealCode}` })
  revalidatePath('/deals')
  // 목록 이동은 화면에서 한다 — 걸어 둔 필터가 있는 주소로 돌아가야 해서 (2026-09-29)
  return {}
}

/** 목록 인라인 토글: 미입금↔입금 / 미결산↔결산 (2026-08-25 회의)
 *  completed 전환 시 입금일/지급일이 비면 오늘 날짜, pending 복귀 시 날짜 제거(통장 리포트 일관성) */
export async function toggleDealPaid(
  id: string,
  side: 'sales' | 'purchase',
): Promise<{ ok: true; status: string; row: InlineRow } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  const [row] = await db
    .select({
      status: deal.status,
      ownerUserId: deal.ownerUserId,
      dealCode: deal.dealCode,
      salesPaidStatus: deal.salesPaidStatus,
      purchasePaidStatus: deal.purchasePaidStatus,
      salesPaidDate: deal.salesPaidDate,
      purchasePaidDate: deal.purchasePaidDate,
      currency: deal.currency,
      fxRate: deal.fxRate,
    })
    .from(deal)
    .where(and(eq(deal.id, id), isNull(deal.deletedAt)))
    .limit(1)
  if (!row) return { error: '거래를 찾을 수 없습니다' }
  if (!(await canEditDealScoped(user, row))) return { error: '수정 권한이 없습니다' }

  const today = new Date().toISOString().slice(0, 10)
  if (side === 'sales') {
    const next = (row.salesPaidStatus === 'completed' ? 'pending' : 'completed') as 'pending' | 'completed'
    const salesPaidDate = next === 'completed' ? (row.salesPaidDate ?? today) : null
    const fxRate = await autoFxRate({ currency: row.currency, salesPaidDate, fxRate: row.fxRate }, row)
    const patch = { salesPaidStatus: next, salesPaidDate, ...(fxRate !== row.fxRate ? { fxRate } : {}) }
    await db.update(deal).set({ ...patch, updatedBy: user.id }).where(eq(deal.id, id))
    await recordDealChanges(id, row, patch, user.id)
    await audit({ action: 'deal.paid_toggle', targetType: 'deal', targetId: id, targetLabel: row.dealCode, summary: `${row.dealCode} 입금 ${next === 'completed' ? '완료' : '미입금으로 되돌림'}`, detail: patch })
    return { ok: true, status: next, row: await getInlineRow(id) }
  }
  const next = (row.purchasePaidStatus === 'completed' ? 'pending' : 'completed') as 'pending' | 'completed'
  const patch = { purchasePaidStatus: next, purchasePaidDate: next === 'completed' ? (row.purchasePaidDate ?? today) : null }
  await db.update(deal).set({ ...patch, updatedBy: user.id }).where(eq(deal.id, id))
  await recordDealChanges(id, row, patch, user.id)
  await audit({ action: 'deal.paid_toggle', targetType: 'deal', targetId: id, targetLabel: row.dealCode, summary: `${row.dealCode} 결산 ${next === 'completed' ? '완료' : '미결산으로 되돌림'}`, detail: patch })
  return { ok: true, status: next, row: await getInlineRow(id) }
}

/** 목록 인라인 셀 편집 (2단계): 금액(매출금/매입금)·날짜 6종 (2026-08-25 회의)
 *  금액 변경 시 VAT(10%)·총액 자동 재계산 — 폼과 동일 규칙. KRW 외 통화는 VAT 0 유지 */
const INLINE_DATE_FIELDS = [
  'salesInvoiceDate',
  'purchaseInvoiceDate',
  'salesDueDate',
  'salesPaidDate',
  'purchaseDueDate',
  'purchasePaidDate',
] as const

const inlineSchema = z.union([
  z.object({
    field: z.enum(['salesAmountNet', 'purchaseAmountNet']),
    value: z.coerce.number().finite().min(0).nullable(),
  }),
  z.object({
    // 인센티브 요율(%) — 비우면 기본 요율로 되돌린다 (2026-10-02 요청)
    field: z.literal('commissionPct'),
    value: z.coerce.number().finite().min(0, '0 이상으로 입력하세요').max(100, '100 이하로 입력하세요').nullable(),
  }),
  z.object({
    // 수정요청/완료 표시 (2026-10-08 요청) — 권한은 lib/review-mark (2026-10-12: 요청은 관리자, 완료는 담당자·관리자)
    field: z.literal('reviewStatus'),
    value: z.enum(['requested', 'done']).nullable(),
  }),
  z.object({
    // 결산연월 인라인 수정 (2026-10-06 요청) — 둘 다 비우면 삭제
    field: z.literal('settlement'),
    value: z.object({ year: z.coerce.number().int().min(2000).max(2100).nullable(), month: z.coerce.number().int().min(1).max(12).nullable() }),
  }),
  z.object({
    field: z.literal('accrual'),
    value: z.object({ year: z.coerce.number().int().min(2000).max(2100), month: z.coerce.number().int().min(1).max(12) }),
  }),
  z.object({
    field: z.enum(INLINE_DATE_FIELDS),
    value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }),
])

export async function updateDealInline(
  id: string,
  raw: unknown,
): Promise<{ ok: true; row: InlineRow } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const parsed = inlineSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }

  const [existing] = await db.select().from(deal).where(and(eq(deal.id, id), isNull(deal.deletedAt))).limit(1)
  if (!existing) return { error: '거래를 찾을 수 없습니다' }
  if (parsed.data.field === 'reviewStatus') return setReviewStatus(user, existing, parsed.data.value)
  if (!(await canEditDealScoped(user, existing))) return { error: '이 거래를 수정할 권한이 없습니다' }

  const { field, value } = parsed.data
  if (field === 'commissionPct') {
    // 거래를 수정할 수 있는 사람이면 요율도 고친다 — 영업 본인·묶음 팀 포함 (2026-10-06 고객: 영업도 수정 가능하게)
    if (!(await canEditDealScoped(user, existing))) return { error: '이 거래의 인센티브를 수정할 권한이 없습니다' }
    const next = value === null ? null : (Math.round(value * 100) / 10000).toFixed(4)
    await db.update(deal).set({ commissionPct: next, updatedBy: user.id }).where(eq(deal.id, id))
    const pct = (v: string | null) => (v === null ? '기본' : `${Math.round(parseFloat(v) * 10000) / 100}%`)
    await audit({ action: 'deal.inline', targetType: 'deal', targetId: id, targetLabel: existing.dealCode, summary: `${existing.dealCode} 인센티브 ${pct(existing.commissionPct)} → ${pct(next)}`, detail: { commissionPct: [existing.commissionPct ?? null, next] } })
    return { ok: true, row: await getInlineRow(id) }
  }
  if (field === 'settlement') {
    const patch = { settlementYear: value.year, settlementMonth: value.month }
    await db.update(deal).set({ ...patch, updatedBy: user.id }).where(eq(deal.id, id))
    await recordDealChanges(id, existing, patch, user.id)
    const ym = (y: number | null, m: number | null) => (y && m ? `${y}-${String(m).padStart(2, '0')}` : '-')
    await audit({ action: 'deal.inline', targetType: 'deal', targetId: id, targetLabel: existing.dealCode, summary: `${existing.dealCode} 결산연월 ${ym(existing.settlementYear, existing.settlementMonth)} → ${ym(value.year, value.month)}`, detail: diffFields(existing as Record<string, unknown>, patch) })
    return { ok: true, row: await getInlineRow(id) }
  }
  if (field === 'accrual') {
    // 귀속연월 인라인 수정 (2026-09-14 피드백)
    const patch = { accrualYear: value.year, accrualMonth: value.month }
    await db.update(deal).set({ ...patch, updatedBy: user.id }).where(eq(deal.id, id))
    await recordDealChanges(id, existing, patch, user.id)
    await audit({ action: 'deal.inline', targetType: 'deal', targetId: id, targetLabel: existing.dealCode, summary: `${existing.dealCode} 귀속월 ${existing.accrualYear}/${existing.accrualMonth} → ${value.year}/${value.month}`, detail: diffFields(existing as Record<string, unknown>, patch) })
    return { ok: true, row: await getInlineRow(id) }
  }
  if (field === 'salesAmountNet' || field === 'purchaseAmountNet') {
    if (!(await canEditDealScoped(user, existing)))
      return { error: '금액을 변경할 권한이 없습니다' }
    const net = value as number | null
    // 부가세 없이 저장된 거래(2026-09-29: 해외영업 건)는 금액을 고쳐도 부가세를 채우지 않는다
    const prevNet = Number(existing[field] ?? 0)
    const prevVat = Number((field === 'salesAmountNet' ? existing.salesVat : existing.purchaseVat) ?? 0)
    const noVat = prevNet !== 0 && prevVat === 0
    // 외화 거래(미국·중국법인)는 부가세 없음 (2026-10-12)
    const withVat = net != null && existing.currency === 'KRW' && !noVat
    const vat = withVat ? Math.round(net * 0.1) : 0
    const patch =
      field === 'salesAmountNet'
        ? {
            salesAmountNet: net != null ? String(net) : null,
            salesVat: withVat ? String(vat) : null,
            salesAmountGross: net != null ? String(net + vat) : null,
          }
        : {
            purchaseAmountNet: net != null ? String(net) : null,
            purchaseVat: withVat ? String(vat) : null,
            purchaseAmountGross: net != null ? String(net + vat) : null,
          }
    await db.update(deal).set({ ...patch, updatedBy: user.id }).where(eq(deal.id, id))
    await recordDealChanges(id, existing, patch, user.id)
    await audit({ action: 'deal.inline', targetType: 'deal', targetId: id, targetLabel: existing.dealCode, summary: `${existing.dealCode} ${field === 'salesAmountNet' ? '매출금' : '매입금'} ${existing[field] ?? '-'} → ${value ?? '-'}`, detail: diffFields(existing as Record<string, unknown>, patch) })
  } else {
    // 외화 거래의 입금일을 고치면 그 날짜 환율로 다시 받는다 (2026-10-12)
    const fx = field === 'salesPaidDate' ? await autoFxRate({ currency: existing.currency, salesPaidDate: value, fxRate: existing.fxRate }, existing) : existing.fxRate
    await db
      .update(deal)
      .set({ [field]: value, ...(fx !== existing.fxRate ? { fxRate: fx } : {}), updatedBy: user.id })
      .where(eq(deal.id, id))
    await recordDealChanges(id, existing, { [field]: value }, user.id)
    await audit({ action: 'deal.inline', targetType: 'deal', targetId: id, targetLabel: existing.dealCode, summary: `${existing.dealCode} ${field} ${existing[field] ?? '-'} → ${value ?? '-'}`, detail: { [field]: [existing[field] ?? null, value] } })
  }
  return { ok: true, row: await getInlineRow(id) }
}

/**
 * 수정요청/완료 표시 (2026-10-12 요청). 수정요청을 걸 때마다 기록해 월별·담당자별 횟수를 센다.
 * 관리자가 방금 건 수정요청을 지우면(실수) 마지막 기록도 지운다.
 */
async function setReviewStatus(
  user: SessionUser,
  existing: typeof deal.$inferSelect,
  value: 'requested' | 'done' | null,
): Promise<{ ok: true; row: InlineRow } | { error: string }> {
  const current = existing.reviewStatus ?? null
  if (current === value) return { ok: true, row: await getInlineRow(existing.id) }
  const allowed = reviewChoices(current, { admin: isAdmin(user.role), owner: existing.ownerUserId === user.id })
  if (!allowed.includes(value))
    return { error: value === 'done' ? '수정완료는 거래 담당자 본인이나 관리자만 표시할 수 있습니다' : '수정요청은 관리자만 걸거나 지울 수 있습니다' }
  await db.transaction(async (tx) => {
    await tx.update(deal).set({ reviewStatus: value, updatedBy: user.id }).where(eq(deal.id, existing.id))
    if (value === 'requested')
      await tx.insert(reviewRequestLog).values({ entity: existing.entity, dealId: existing.id, ownerUserId: existing.ownerUserId, requestedBy: user.id })
    // 요청취소(2026-10-13) — 수정요청 자체를 없던 일로: 수정완료 뒤 취소해도 그 요청 1회를 횟수에서 뺀다
    if (value === null) {
      const [last] = await tx.select({ id: reviewRequestLog.id }).from(reviewRequestLog).where(eq(reviewRequestLog.dealId, existing.id)).orderBy(desc(reviewRequestLog.id)).limit(1)
      if (last) await tx.delete(reviewRequestLog).where(eq(reviewRequestLog.id, last.id))
    }
  })
  const label = (v: 'requested' | 'done' | null) => (v ? REVIEW_LABEL[v] : '없음')
  await audit({ action: 'deal.inline', targetType: 'deal', targetId: existing.id, targetLabel: existing.dealCode, summary: `${existing.dealCode} 표시 ${label(current)} → ${label(value)}`, detail: { reviewStatus: [current, value] } })
  return { ok: true, row: await getInlineRow(existing.id) }
}

/** 거래코드 중복 검사 — 폼 입력 시 즉시 안내 (2026-09-09 피드백) */
export async function checkDealCode(code: unknown, excludeId?: unknown): Promise<{ duplicate: boolean }> {
  const c = typeof code === 'string' ? code.trim() : ''
  if (!c) return { duplicate: false }
  const rows = await db.select({ id: deal.id }).from(deal).where(and(eq(deal.entity, await getCurrentEntity()), eq(deal.dealCode, c), isNull(deal.deletedAt))).limit(1)
  const other = rows.find((r) => r.id !== excludeId)
  return { duplicate: Boolean(other) }
}

// ── 목록 체크박스 일괄 작업 (2026-09-17 피드백) ─────────────────────────

const idsSchema = z.array(z.string().uuid()).min(1, '거래를 선택하세요').max(1000)

/** 선택한 거래 삭제 — 권한 없는 건은 건너뛰고 건수로 알려 준다 */
export async function deleteDeals(rawIds: unknown): Promise<{ ok: true; deleted: number; skipped: number } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const parsed = idsSchema.safeParse(rawIds)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '잘못된 요청' }
  const rows = await db
    .select({ id: deal.id, status: deal.status, ownerUserId: deal.ownerUserId, dealCode: deal.dealCode })
    .from(deal)
    .where(and(inArray(deal.id, parsed.data), isNull(deal.deletedAt)))
  const allowed = rows.filter((r) => canDeleteDeal(user, r))
  if (allowed.length === 0) return { error: '삭제할 수 있는 거래가 없습니다 (본인 거래만 삭제할 수 있습니다)' }
  await db.update(deal).set({ deletedAt: new Date(), updatedBy: user.id }).where(inArray(deal.id, allowed.map((r) => r.id)))
  for (const r of allowed)
    await audit({ action: 'deal.delete', targetType: 'deal', targetId: r.id, targetLabel: r.dealCode, summary: `거래 삭제 ${r.dealCode} (목록 일괄)` })
  revalidatePath('/deals')
  return { ok: true, deleted: allowed.length, skipped: parsed.data.length - allowed.length }
}

const bulkInvoiceSchema = z.object({
  ids: idsSchema,
  side: z.enum(['sales', 'purchase']),
  date: dateSchema,
})

/** 선택한 거래의 매출/매입 계산서 발행일을 한 번에 지정 — 여러 거래코드를 한 장의 계산서로 통합 발행하는 경우 */
export async function bulkSetInvoiceDate(raw: unknown): Promise<{ ok: true; updated: number; skipped: number } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const parsed = bulkInvoiceSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '잘못된 요청' }
  const { ids, side, date } = parsed.data
  const field = side === 'sales' ? 'salesInvoiceDate' : 'purchaseInvoiceDate'
  const rows = await db.select().from(deal).where(and(inArray(deal.id, ids), isNull(deal.deletedAt)))
  let updated = 0
  let skipped = ids.length - rows.length
  for (const row of rows) {
    if (!(await canEditDealScoped(user, row))) {
      skipped++
      continue
    }
    if ((row[field] ?? null) === date) continue
    const patch = { [field]: date }
    await db.update(deal).set({ ...patch, updatedBy: user.id }).where(eq(deal.id, row.id))
    await recordDealChanges(row.id, row, patch, user.id)
    await audit({
      action: 'deal.inline',
      targetType: 'deal',
      targetId: row.id,
      targetLabel: row.dealCode,
      summary: `${row.dealCode} ${side === 'sales' ? '매출' : '매입'}계산서 발행일 ${row[field] ?? '-'} → ${date ?? '-'} (목록 일괄)`,
      detail: diffFields(row as Record<string, unknown>, patch),
    })
    updated++
  }
  revalidatePath('/deals')
  return { ok: true, updated, skipped }
}
