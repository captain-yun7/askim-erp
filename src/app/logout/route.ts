import { NextResponse } from 'next/server'

/**
 * 로그아웃 마무리 — 미들웨어 매처에서 제외된 경로.
 * 서버 액션 signOut 의 쿠키 삭제가 같은 응답에 실리는 미들웨어의 세션 갱신 Set-Cookie 에 덮여
 * Vercel 에서 세션이 되살아나던 문제(2026-09-09) → 여기서 세션 쿠키를 확정적으로 제거하고 /login 으로.
 */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303)
  for (const name of ['authjs.session-token', '__Secure-authjs.session-token']) {
    res.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: name.startsWith('__Secure-'),
    })
  }
  return res
}
