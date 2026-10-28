'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { getCurrentEntity } from '@/server/entity'
import { counterparty } from '@/lib/db/schema'
import {
  canCreateCounterparty,
  canDeleteCounterparty,
  canEditCounterparty,
  canEditCounterpartySensitive,
  getSessionUser,
} from '@/server/auth/guards'
import { audit, diffFields } from '@/server/audit'
import { clientTypeLabel, isClientType } from '@/lib/client-type'

/** 회계/admin만 변경 가능한 민감 필드 */
const SENSITIVE_FIELDS = [
  'businessNo',
  'bankAccountRaw',
  'bankName',
  'accountNo',
  'accountHolder',
  'officialFeeRate',
  'unofficialFeeRate',
] as const

function norm(v: unknown): string | null {
  return v === '' || v === null || v === undefined ? null : String(v)
}

const counterpartySchema = z.object({
  name: z.string().trim().min(1, '상호명 필수'),
  businessNo: z.string().trim().optional().nullable(),
  ceo: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  businessType: z.string().trim().optional().nullable(),
  businessCategory: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  contactPerson: z.string().trim().optional().nullable(),
  bankAccountRaw: z.string().trim().optional().nullable(),
  bankName: z.string().trim().optional().nullable(),
  accountNo: z.string().trim().optional().nullable(),
  accountHolder: z.string().trim().optional().nullable(),
  officialFeeRate: z.string().trim().optional().nullable(),
  unofficialFeeRate: z.string().trim().optional().nullable(),
  paymentTerm: z.string().trim().optional().nullable(),
  memo: z.string().trim().optional().nullable(),
  roleTags: z.array(z.string()).default([]),
  clientType: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (isClientType(v) ? v : null)),
})

export type CounterpartyInput = z.infer<typeof counterpartySchema>

function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === '' ? null : v
  }
  return out as T
}

/**
 * 사업자번호는 법인 안에서 하나 (삭제한 거래처 포함). 겹치면 저장 전에 어느 거래처와 겹치는지 알려 준다
 * (2026-10-28: 겹친 채 저장해 'This page couldn't load' 오류 화면이 뜸)
 */
async function businessNoTaken(entity: string, businessNo: string | null | undefined, exceptId?: string): Promise<string | null> {
  if (!businessNo) return null
  const [dup] = await db
    .select({ name: counterparty.name, deletedAt: counterparty.deletedAt })
    .from(counterparty)
    .where(and(eq(counterparty.entity, entity), eq(counterparty.businessNo, businessNo), exceptId ? ne(counterparty.id, exceptId) : undefined))
    .limit(1)
  if (!dup) return null
  return `사업자번호 ${businessNo} 는 이미 '${dup.name}'${dup.deletedAt ? '(삭제된 거래처)' : ''}에 등록되어 있습니다. 같은 회사면 그 거래처를 쓰거나, 번호가 잘못 들어간 쪽을 고쳐 주세요`
}

export async function createCounterparty(raw: unknown) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canCreateCounterparty(user.role))
    return { error: '거래처 등록 권한이 없습니다' }
  const parsed = counterpartySchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }
  const data = emptyToNull(parsed.data)
  const entity = await getCurrentEntity()
  const taken = await businessNoTaken(entity, data.businessNo)
  if (taken) return { error: taken }
  const [row] = await db
    .insert(counterparty)
    .values({ ...data, entity, createdBy: user.id })
    .returning({ id: counterparty.id, name: counterparty.name })
  await audit({ action: 'counterparty.create', targetType: 'counterparty', targetId: row.id, targetLabel: row.name, summary: `거래처 등록 ${row.name}` })
  revalidatePath('/counterparties')
  revalidatePath('/deals')
  return { ok: true, counterparty: row }
}

export async function updateCounterparty(id: string, raw: unknown) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  const parsed = counterpartySchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }

  const [existing] = await db
    .select()
    .from(counterparty)
    .where(eq(counterparty.id, id))
    .limit(1)
  if (!existing) return { error: '거래처를 찾을 수 없습니다' }

  if (!canEditCounterparty(user, existing)) {
    return { error: '이 거래처를 수정할 권한이 없습니다' }
  }

  // 민감 필드 변경은 회계/admin만
  const data = emptyToNull(parsed.data)
  if (!canEditCounterpartySensitive(user.role)) {
    const changedSensitive = SENSITIVE_FIELDS.some(
      (f) => norm(data[f]) !== norm(existing[f]),
    )
    if (changedSensitive) {
      return {
        error: '사업자번호·계좌·수수료는 회계 담당자만 변경할 수 있습니다',
      }
    }
  }

  const taken = await businessNoTaken(existing.entity, data.businessNo, id)
  if (taken) return { error: taken }
  await db.update(counterparty).set(data).where(eq(counterparty.id, id))
  const changed = diffFields(existing as Record<string, unknown>, data as Record<string, unknown>)
  await audit({ action: 'counterparty.update', targetType: 'counterparty', targetId: id, targetLabel: existing.name, summary: `거래처 수정 ${existing.name} (${Object.keys(changed).length}개 항목)`, detail: changed })
  revalidatePath('/counterparties')
  revalidatePath('/deals')
  return { ok: true }
}

export async function deleteCounterparty(id: string) {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canDeleteCounterparty(user.role))
    return { error: '거래처 삭제 권한이 없습니다' }
  await db
    .update(counterparty)
    .set({ deletedAt: new Date(), isActive: false })
    .where(eq(counterparty.id, id))
  await audit({ action: 'counterparty.delete', targetType: 'counterparty', targetId: id, summary: `거래처 비활성화 ${id}` })
  revalidatePath('/counterparties')
  return { ok: true }
}

/** 거래처 여러 건 삭제 (2026-09-16 피드백: 목록 체크박스). soft delete — 기존 거래에 적힌 거래처명은 그대로 남는다 */
export async function deleteCounterparties(ids: unknown): Promise<{ ok: true; deleted: number } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canDeleteCounterparty(user.role)) return { error: '거래처 삭제 권한이 없습니다' }
  const parsed = z.array(z.string().uuid()).min(1).max(500).safeParse(ids)
  if (!parsed.success) return { error: '삭제할 거래처를 선택하세요' }
  const rows = await db
    .update(counterparty)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(inArray(counterparty.id, parsed.data), isNull(counterparty.deletedAt)))
    .returning({ id: counterparty.id, name: counterparty.name })
  for (const r of rows)
    await audit({ action: 'counterparty.delete', targetType: 'counterparty', targetId: r.id, targetLabel: r.name, summary: `거래처 삭제 ${r.name}` })
  revalidatePath('/counterparties')
  return { ok: true, deleted: rows.length }
}

/** 거래처 구분 지정 — 한 건 또는 여러 건 (2026-09-28 매출분석보고서). null 이면 미지정으로 되돌림 */
export async function setCounterpartyClientType(rawIds: unknown, rawType: unknown): Promise<{ ok: true; updated: number } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canEditCounterpartySensitive(user.role)) return { error: '거래처 수정 권한이 없습니다' }
  const ids = z.array(z.string().uuid()).min(1, '거래처를 선택하세요').max(500).safeParse(rawIds)
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? '잘못된 요청' }
  if (rawType !== null && !isClientType(rawType)) return { error: '잘못된 구분' }
  const type = rawType as string | null
  const rows = await db
    .update(counterparty)
    .set({ clientType: type })
    .where(and(inArray(counterparty.id, ids.data), isNull(counterparty.deletedAt)))
    .returning({ id: counterparty.id, name: counterparty.name })
  for (const r of rows)
    await audit({ action: 'counterparty.update', targetType: 'counterparty', targetId: r.id, targetLabel: r.name, summary: `거래처 구분 → ${clientTypeLabel(type)} (${r.name})`, detail: { clientType: type } })
  revalidatePath('/counterparties')
  revalidatePath('/reports/sales-analysis')
  return { ok: true, updated: rows.length }
}
