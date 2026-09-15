import NextAuth from 'next-auth'
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from 'next/server'
import { authConfig } from './auth.config'
import { LOGGED_OUT_COOKIE, clearSessionCookies } from './lib/auth-cookies'

const { auth } = NextAuth(authConfig)
// 콜백 형태에서는 authorized 콜백의 false 가 리다이렉트로 이어지지 않아(빈 화면 사고 2026-09-15) 여기서 직접 처리
// 리다이렉트 기준 origin 은 요청 헤더에서 — NextAuth 래퍼 안의 req.nextUrl 은 AUTH_URL 로 재구성되어 포트가 어긋날 수 있음
function originOf(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  return `${proto}://${host}`
}

const authMiddleware = auth((req) => {
  const loggedIn = Boolean(req.auth?.user)
  const onLogin = req.nextUrl.pathname.startsWith('/login')
  if (!loggedIn && !onLogin) return NextResponse.redirect(new URL('/login', originOf(req)))
  if (loggedIn && onLogin) return NextResponse.redirect(new URL('/', originOf(req)))
  return NextResponse.next()
}) as unknown as NextMiddleware

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  // 로그아웃 표식이 있으면 남아 있는 세션 쿠키를 무시하고 지운다 (표식은 로그인 성공 시 제거)
  if (req.cookies.has(LOGGED_OUT_COOKIE)) {
    const onLogin = req.nextUrl.pathname.startsWith('/login')
    const res = onLogin ? NextResponse.next() : NextResponse.redirect(new URL('/login', originOf(req)))
    clearSessionCookies(res)
    return res
  }
  return authMiddleware(req, ev)
}

export const config = {
  matcher: ['/((?!api/auth|logout|_next/static|_next/image|favicon.ico|brand/).*)'],
}
