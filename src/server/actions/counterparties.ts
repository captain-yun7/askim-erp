'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { counterparty } from '@/lib/db/schema'

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
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인 필요' }
  const parsed = counterpartySchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }
  const data = emptyToNull(parsed.data)
  const [row] = await db
    .insert(counterparty)
    .values({ ...data, createdBy: session.user.id })
    .returning({ id: counterparty.id, name: counterparty.name })
  revalidatePath('/counterparties')
  revalidatePath('/deals')
  return { ok: true, counterparty: row }
}

export async function updateCounterparty(id: string, raw: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인 필요' }
  const parsed = counterpartySchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }
  await db
    .update(counterparty)
    .set(emptyToNull(parsed.data))
    .where(eq(counterparty.id, id))
  revalidatePath('/counterparties')
  revalidatePath('/deals')
  return { ok: true }
}

export async function deleteCounterparty(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인 필요' }
  await db
    .update(counterparty)
    .set({ deletedAt: new Date(), isActive: false })
    .where(eq(counterparty.id, id))
  revalidatePath('/counterparties')
  return { ok: true }
}
