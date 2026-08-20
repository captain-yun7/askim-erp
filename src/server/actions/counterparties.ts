'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { counterparty } from '@/lib/db/schema'
import {
  canCreateCounterparty,
  canDeleteCounterparty,
  canEditCounterparty,
  canEditCounterpartySensitive,
  getSessionUser,
} from '@/server/auth/guards'

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
})

export type CounterpartyInput = z.infer<typeof counterpartySchema>

function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === '' ? null : v
  }
  return out as T
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
  const [row] = await db
    .insert(counterparty)
    .values({ ...data, createdBy: user.id })
    .returning({ id: counterparty.id, name: counterparty.name })
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

  await db.update(counterparty).set(data).where(eq(counterparty.id, id))
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
  revalidatePath('/counterparties')
  return { ok: true }
}
