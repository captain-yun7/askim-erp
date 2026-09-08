import { NextResponse } from 'next/server'
import { LOGGED_OUT_COOKIE, clearSessionCookies } from '@/lib/auth-cookies'

/**
 * 로그아웃 마무리 — 미들웨어 매처에서 제외된 경로.
 * 세션 쿠키를 지우고 '로그아웃됨' 표식을 남긴다. 로그아웃 직후 늦게 도착하는 프리페치 응답이
 * 미들웨어의 세션 갱신 Set-Cookie 로 세션을 되살리던 문제(2026-09-09, Vercel) → 표식이 있으면 미들웨어가 세션을 무시·삭제.
 */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303)
  clearSessionCookies(res)
  res.cookies.set(LOGGED_OUT_COOKIE, '1', { maxAge: 10 * 60, path: '/', httpOnly: true, sameSite: 'lax', secure: new URL(req.url).protocol === 'https:' })
  return res
}
