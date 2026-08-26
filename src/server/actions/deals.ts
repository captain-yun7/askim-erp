'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { deal, users } from '@/lib/db/schema'
import {
  canCreateDeal,
  canDeleteDeal,
  canEditDeal,
  canEditDealAmounts,
  getSessionUser,
} from '@/server/auth/guards'

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
  // 빈값/공백이면 undefined → 저장 시 자동 채번
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
  status: z.enum(['draft', 'confirmed', 'closed']).default('draft'),
  // 매출
  salesMethodId: z.coerce.number().int().nullable().optional(),
  issuerCounterpartyId: z.string().uuid().nullable().optional(),
  advertiserCounterpartyId: z.string().uuid().nullable().optional(),
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
  settlementYear: z.coerce.number().int().nullable().optional(),
  settlementMonth: z.coerce.number().int().nullable().optional(),
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
})

export type DealInput = z.infer<typeof dealSchema>

/** 거래코드 자동 채번: [prefix][YYMMDD][-N] */
async function autoNumberDealCode(ownerId: string | null | undefined): Promise<string> {
  let prefix = 'XX'
  if (ownerId) {
    const [u] = await db
      .select({ p: users.dealCodePrefix })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1)
    if (u?.p) prefix = u.p
  }
  const now = new Date()
  const yymmdd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const base = `${prefix}${yymmdd}`

  // 같은 base 가진 거래 개수
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(deal)
    .where(sql`${deal.dealCodeBase} = ${base}`)
  if (c === 0) return base
  return `${base}-${c + 1}`
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
  const dealCode = data.dealCode?.trim() || (await autoNumberDealCode(data.ownerUserId))

  try {
    const [row] = await db
      .insert(deal)
      .values({
        ...data,
        dealCode,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: deal.id, dealCode: deal.dealCode })
    revalidatePath('/deals')
    return { ok: true, deal: row }
  } catch (e) {
    if (e instanceof Error && e.message.includes('unique')) {
      return { error: `거래코드 중복: ${dealCode}` }
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

  const [existing] = await db
    .select({
      status: deal.status,
      ownerUserId: deal.ownerUserId,
      salesAmountNet: deal.salesAmountNet,
      salesVat: deal.salesVat,
      salesAmountGross: deal.salesAmountGross,
      purchaseAmountNet: deal.purchaseAmountNet,
      purchaseVat: deal.purchaseVat,
      purchaseAmountGross: deal.purchaseAmountGross,
    })
    .from(deal)
    .where(eq(deal.id, id))
    .limit(1)
  if (!existing) return { error: '거래를 찾을 수 없습니다' }

  if (!canEditDeal(user, existing)) {
    return {
      error:
        existing.status === 'closed'
          ? '완료(closed) 거래는 회계만 수정할 수 있습니다'
          : '이 거래를 수정할 권한이 없습니다',
    }
  }

  // 금액 변경 권한 확인
  const amountChanged = AMOUNT_FIELDS.some(
    (f) => !numEq(parsed.data[f], existing[f]),
  )
  if (amountChanged && !canEditDealAmounts(user, existing)) {
    return { error: '금액은 draft 상태의 본인 거래에서만 변경할 수 있습니다' }
  }

  // 영업은 본인 거래를 closed 로 전이 불가
  if (user.role === 'sales' && parsed.data.status === 'closed') {
    return { error: '거래 완료 처리는 회계만 가능합니다' }
  }

  await db
    .update(deal)
    .set({ ...parsed.data, updatedBy: user.id })
    .where(eq(deal.id, id))
  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
  return { ok: true }
}

export async function deleteDeal(id: string) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  const [existing] = await db
    .select({ status: deal.status, ownerUserId: deal.ownerUserId })
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
  revalidatePath('/deals')
  redirect('/deals')
}

/** 목록 인라인 토글: 미입금↔입금 / 미결산↔결산 (2026-08-25 회의)
 *  completed 전환 시 입금일/지급일이 비면 오늘 날짜, pending 복귀 시 날짜 제거(통장 리포트 일관성) */
export async function toggleDealPaid(
  id: string,
  side: 'sales' | 'purchase',
): Promise<{ ok: true; status: string } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  const [row] = await db
    .select({
      status: deal.status,
      ownerUserId: deal.ownerUserId,
      salesPaidStatus: deal.salesPaidStatus,
      purchasePaidStatus: deal.purchasePaidStatus,
      salesPaidDate: deal.salesPaidDate,
      purchasePaidDate: deal.purchasePaidDate,
    })
    .from(deal)
    .where(and(eq(deal.id, id), isNull(deal.deletedAt)))
    .limit(1)
  if (!row) return { error: '거래를 찾을 수 없습니다' }
  if (!canEditDeal(user, row)) return { error: '수정 권한이 없습니다' }

  const today = new Date().toISOString().slice(0, 10)
  if (side === 'sales') {
    const next = row.salesPaidStatus === 'completed' ? 'pending' : 'completed'
    await db
      .update(deal)
      .set({
        salesPaidStatus: next,
        salesPaidDate: next === 'completed' ? (row.salesPaidDate ?? today) : null,
        updatedBy: user.id,
      })
      .where(eq(deal.id, id))
    revalidatePath('/deals')
    return { ok: true, status: next }
  }
  const next = row.purchasePaidStatus === 'completed' ? 'pending' : 'completed'
  await db
    .update(deal)
    .set({
      purchasePaidStatus: next,
      purchasePaidDate: next === 'completed' ? (row.purchasePaidDate ?? today) : null,
      updatedBy: user.id,
    })
    .where(eq(deal.id, id))
  revalidatePath('/deals')
  return { ok: true, status: next }
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
    field: z.enum(INLINE_DATE_FIELDS),
    value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }),
])

export async function updateDealInline(
  id: string,
  raw: unknown,
): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const parsed = inlineSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }

  const [existing] = await db
    .select({
      status: deal.status,
      ownerUserId: deal.ownerUserId,
      currency: deal.currency,
    })
    .from(deal)
    .where(and(eq(deal.id, id), isNull(deal.deletedAt)))
    .limit(1)
  if (!existing) return { error: '거래를 찾을 수 없습니다' }
  if (!canEditDeal(user, existing)) return { error: '이 거래를 수정할 권한이 없습니다' }

  const { field, value } = parsed.data
  if (field === 'salesAmountNet' || field === 'purchaseAmountNet') {
    if (!canEditDealAmounts(user, existing))
      return { error: '금액은 회계/admin(영업은 본인 draft)만 수정할 수 있습니다' }
    const net = value as number | null
    const vat = net != null && existing.currency === 'KRW' ? Math.round(net * 0.1) : 0
    const patch =
      field === 'salesAmountNet'
        ? {
            salesAmountNet: net != null ? String(net) : null,
            salesVat: net != null ? String(vat) : null,
            salesAmountGross: net != null ? String(net + vat) : null,
          }
        : {
            purchaseAmountNet: net != null ? String(net) : null,
            purchaseVat: net != null ? String(vat) : null,
            purchaseAmountGross: net != null ? String(net + vat) : null,
          }
    await db.update(deal).set({ ...patch, updatedBy: user.id }).where(eq(deal.id, id))
  } else {
    await db
      .update(deal)
      .set({ [field]: value, updatedBy: user.id })
      .where(eq(deal.id, id))
  }
  revalidatePath('/deals')
  return { ok: true }
}
