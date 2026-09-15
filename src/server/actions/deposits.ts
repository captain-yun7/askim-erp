'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { deposit, exclusiveContract } from '@/lib/db/schema'
import { getSessionUser, type SessionUser } from '@/server/auth/guards'
import { audit, diffFields } from '@/server/audit'

type Result = { ok: true } | { error: string }

async function requireEditor(): Promise<{ error: string } | { user: SessionUser }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (user.role === 'viewer') return { error: '수정 권한이 없습니다' }
  return { user }
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()

const depositSchema = z.object({
  counterpartyName: z.string().trim().min(1, '거래처명 필수'),
  description: z.string().trim().optional().nullable(),
  ownerName: z.string().trim().optional().nullable(),
  amount: z.coerce.number().finite().min(0),
  paidDate: dateStr,
  returnedDate: dateStr,
  status: z.enum(['held', 'returned', 'offset', 'unreturned']),
  memo: z.string().trim().optional().nullable(),
})

export async function saveDeposit(id: number | null, raw: unknown): Promise<Result> {
  const guard = await requireEditor()
  if ('error' in guard) return { error: guard.error }
  const parsed = depositSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const values = {
    ...parsed.data,
    amount: String(parsed.data.amount),
    description: parsed.data.description || null,
    ownerName: parsed.data.ownerName || null,
    memo: parsed.data.memo || null,
  }
  if (id != null) {
    await db.update(deposit).set(values).where(eq(deposit.id, id))
  } else {
    // 등록자를 담당자로 (팀원 본인 것만 조회 기준)
    await db.insert(deposit).values({ ...values, ownerUserId: guard.user.id, ownerName: values.ownerName ?? guard.user.name ?? null })
  }
  await audit({ action: 'deposit.save', targetType: 'deposit', targetId: id, targetLabel: values.counterpartyName, summary: `보증금 ${id != null ? '수정' : '등록'} ${values.counterpartyName} ${Number(values.amount).toLocaleString()}원`, detail: values })
  revalidatePath('/deposits')
  return { ok: true }
}

export async function deleteDeposit(id: number): Promise<Result> {
  const guard = await requireEditor()
  if ('error' in guard) return { error: guard.error }
  await db.update(deposit).set({ deletedAt: new Date() }).where(eq(deposit.id, id))
  await audit({ action: 'deposit.delete', targetType: 'deposit', targetId: id, summary: `보증금 삭제 #${id}` })
  revalidatePath('/deposits')
  return { ok: true }
}

const contractSchema = z.object({
  kind: z.enum(['exclusive', 'asset']).default('exclusive'),
  mediaName: z.string().trim().min(1, '매체명 필수'),
  mediaType: z.string().trim().optional().nullable(),
  ownerName: z.string().trim().optional().nullable(),
  contractPeriod: z.string().trim().optional().nullable(),
  contractTerms: z.string().trim().optional().nullable(),
  hasMonthlyFee: z.enum(['O', 'X']).nullable(),
  depositPaidDate: dateStr,
  depositReturnedDate: dateStr,
  memo: z.string().trim().optional().nullable(),
})

export async function saveExclusiveContract(id: number | null, raw: unknown): Promise<Result> {
  const guard = await requireEditor()
  if ('error' in guard) return { error: guard.error }
  const parsed = contractSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const values = {
    ...parsed.data,
    mediaType: parsed.data.mediaType || null,
    ownerName: parsed.data.ownerName || null,
    contractPeriod: parsed.data.contractPeriod || null,
    contractTerms: parsed.data.contractTerms || null,
    memo: parsed.data.memo || null,
  }
  if (id != null) {
    await db.update(exclusiveContract).set(values).where(eq(exclusiveContract.id, id))
  } else {
    await db.insert(exclusiveContract).values({ ...values, ownerUserId: guard.user.id, ownerName: values.ownerName ?? guard.user.name ?? null })
  }
  await audit({ action: 'contract.save', targetType: 'contract', targetId: id, targetLabel: values.mediaName, summary: `${values.kind === 'asset' ? '보유자산' : '전속계약'} ${id != null ? '수정' : '등록'} ${values.mediaName}`, detail: values })
  revalidatePath('/deposits')
  return { ok: true }
}

export async function deleteExclusiveContract(id: number): Promise<Result> {
  const guard = await requireEditor()
  if ('error' in guard) return { error: guard.error }
  await db
    .update(exclusiveContract)
    .set({ deletedAt: new Date() })
    .where(eq(exclusiveContract.id, id))
  await audit({ action: 'contract.delete', targetType: 'contract', targetId: id, summary: `전속계약/보유자산 삭제 #${id}` })
  revalidatePath('/deposits')
  return { ok: true }
}
