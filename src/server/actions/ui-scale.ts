'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { parseUiScale } from '@/lib/ui-scale'
import { getSessionUser } from '@/server/auth/guards'

export async function setUiScaleAction(value: string) {
  const me = await getSessionUser()
  if (!me) return { error: '로그인 필요' }
  const scale = parseUiScale(value)
  await db.update(users).set({ uiScale: scale }).where(eq(users.id, me.id))
  revalidatePath('/', 'layout')
  return { ok: true, scale }
}
