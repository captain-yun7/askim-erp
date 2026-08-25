'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { canManageUsers, getSessionUser } from '@/server/auth/guards'

const roleSchema = z.enum(['admin', 'accountant', 'sales', 'viewer'])

const createUserSchema = z.object({
  name: z.string().trim().min(1, '이름 필수'),
  email: z.string().trim().toLowerCase().email('이메일 형식이 아닙니다'),
  password: z.string().min(6, '비밀번호는 6자 이상'),
  role: roleSchema.default('sales'),
  team: z.string().trim().optional().nullable(),
  dealCodePrefix: z.string().trim().optional().nullable(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

async function requireAdmin() {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' as const }
  if (!canManageUsers(user.role)) return { error: '권한이 없습니다' as const }
  return { user }
}

export async function createUser(raw: unknown) {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const parsed = createUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  }
  const { name, email, password, role, team, dealCodePrefix } = parsed.data

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (existing) return { error: '이미 등록된 이메일입니다' }

  const passwordHash = await bcrypt.hash(password, 10)
  const [row] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
      role,
      team: team || null,
      dealCodePrefix: dealCodePrefix || null,
    })
    .returning({ id: users.id })

  revalidatePath('/admin/users')
  return { ok: true, id: row?.id }
}

export async function updateUserRole(id: string, role: unknown) {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const parsed = roleSchema.safeParse(role)
  if (!parsed.success) return { error: '잘못된 역할입니다' }

  // 본인 역할 강등 방지
  if (id === guard.user.id && parsed.data !== 'admin') {
    return { error: '본인의 admin 권한은 해제할 수 없습니다' }
  }

  await db.update(users).set({ role: parsed.data }).where(eq(users.id, id))
  revalidatePath('/admin/users')
  return { ok: true }
}

export async function toggleUserTeamLead(id: string, isTeamLead: unknown) {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }
  const parsed = z.boolean().safeParse(isTeamLead)
  if (!parsed.success) return { error: '잘못된 값입니다' }
  await db.update(users).set({ isTeamLead: parsed.data }).where(eq(users.id, id))
  revalidatePath('/admin/users')
  return { ok: true }
}

export async function toggleUserActive(id: string, active: unknown) {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const isActive = z.boolean().safeParse(active)
  if (!isActive.success) return { error: '잘못된 값입니다' }

  if (id === guard.user.id && !isActive.data) {
    return { error: '본인 계정은 비활성화할 수 없습니다' }
  }

  await db
    .update(users)
    .set({ isActive: isActive.data })
    .where(eq(users.id, id))
  revalidatePath('/admin/users')
  return { ok: true }
}
