'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { deposit, exclusiveContract } from '@/lib/db/schema'
import { getSessionUser, type SessionUser } from '@/server/auth/guards'

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
    await db.insert(deposit).values(values)
  }
  revalidatePath('/deposits')
  return { ok: true }
}

export async function deleteDeposit(id: number): Promise<Result> {
  const guard = await requireEditor()
  if ('error' in guard) return { error: guard.error }
  await db.update(deposit).set({ deletedAt: new Date() }).where(eq(deposit.id, id))
  revalidatePath('/deposits')
  return { ok: true }
}

const contractSchema = z.object({
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
    await db.insert(exclusiveContract).values(values)
  }
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
  revalidatePath('/deposits')
  return { ok: true }
}
