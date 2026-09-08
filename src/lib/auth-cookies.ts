import type { NextResponse } from 'next/server'

export const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'] as const
/** 로그아웃 표식 — 미들웨어가 이 쿠키를 보면 세션을 무효 처리 (늦게 도착한 세션 갱신 응답 대비) */
export const LOGGED_OUT_COOKIE = 'askim-logged-out'

export function clearSessionCookies(res: NextResponse) {
  for (const name of SESSION_COOKIES) {
    res.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: name.startsWith('__Secure-'),
    })
  }
}
