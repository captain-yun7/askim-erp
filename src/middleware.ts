import NextAuth from 'next-auth'
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from 'next/server'
import { authConfig } from './auth.config'
import { LOGGED_OUT_COOKIE, clearSessionCookies } from './lib/auth-cookies'

const { auth } = NextAuth(authConfig)
// 콜백이 아무것도 반환하지 않으면 authConfig.callbacks.authorized 결과(리다이렉트/통과)를 그대로 적용
const authMiddleware = auth(() => undefined) as unknown as NextMiddleware

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  // 로그아웃 표식이 있으면 남아 있는 세션 쿠키를 무시하고 지운다 (표식은 로그인 성공 시 제거)
  if (req.cookies.has(LOGGED_OUT_COOKIE)) {
    const onLogin = req.nextUrl.pathname.startsWith('/login')
    const res = onLogin ? NextResponse.next() : NextResponse.redirect(new URL('/login', req.nextUrl))
    clearSessionCookies(res)
    return res
  }
  return authMiddleware(req, ev)
}

export const config = {
  matcher: ['/((?!api/auth|logout|_next/static|_next/image|favicon.ico|brand/).*)'],
}
