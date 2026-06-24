'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { getSessionUser } from '@/server/auth/guards'

const profileSchema = z
  .object({
    name: z.string().trim().min(1, '이름을 입력하세요'),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
  })
  .refine(
    (v) => !v.newPassword || v.newPassword.length >= 8,
    { message: '새 비밀번호는 8자 이상이어야 합니다', path: ['newPassword'] },
  )

export async function updateProfile(raw: unknown) {
  const sessionUser = await getSessionUser()
  if (!sessionUser) return { error: '로그인 필요' }
  const parsed = profileSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }
  const { name, currentPassword, newPassword } = parsed.data

  const set: { name: string; passwordHash?: string } = { name }

  if (newPassword) {
    const [u] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1)
    if (!u) return { error: '사용자를 찾을 수 없습니다' }
    const ok = await bcrypt.compare(currentPassword ?? '', u.passwordHash)
    if (!ok) return { error: '현재 비밀번호가 올바르지 않습니다' }
    set.passwordHash = await bcrypt.hash(newPassword, 10)
  }

  await db.update(users).set(set).where(eq(users.id, sessionUser.id))
  revalidatePath('/profile')
  return { ok: true }
}
