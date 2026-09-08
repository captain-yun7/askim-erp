'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'
import { LOGGED_OUT_COOKIE } from '@/lib/auth-cookies'

export async function loginAction(formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirect: false,
    })
    ;(await cookies()).delete(LOGGED_OUT_COOKIE)
    return { ok: true }
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.type === 'CredentialsSignin') {
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
