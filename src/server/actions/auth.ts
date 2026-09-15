'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'
import { LOGGED_OUT_COOKIE } from '@/lib/auth-cookies'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import type { SessionUser } from '@/server/auth/guards'
import { audit } from '@/server/audit'

export async function loginAction(formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirect: false,
    })
    ;(await cookies()).delete(LOGGED_OUT_COOKIE)
    const email = String(formData.get('email') ?? '').toLowerCase()
    const [u] = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.email, email)).limit(1)
    await audit({ action: 'auth.login', summary: `로그인 ${email}`, actor: u ? { id: u.id, name: u.name, role: u.role as SessionUser['role'] } : null })
    return { ok: true }
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.type === 'CredentialsSignin') {
        await audit({ action: 'auth.login_failed', summary: `로그인 실패 ${String(formData.get('email') ?? '')}`, actor: null })
        return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
      }
      return { error: '로그인 중 오류가 발생했습니다.' }
    }
    throw e
  }
}

/** 화면에서는 window.location.assign('/logout') 을 쓴다 — 서버 액션 redirect 는 RSC fetch 라 쿠키 삭제가 안 먹음 */
export async function logoutAction() {
  await signOut({ redirect: false })
  redirect('/logout')
}
