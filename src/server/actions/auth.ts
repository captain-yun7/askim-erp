'use server'

import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'

export async function loginAction(formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirect: false,
    })
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

export async function logoutAction() {
  await signOut({ redirect: false })
  // 쿠키 삭제는 미들웨어를 타지 않는 /logout 라우트에서 확정 (app/logout/route.ts 참고)
  redirect('/logout')
}
