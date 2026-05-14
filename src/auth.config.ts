import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-safe 설정 (미들웨어용 — DB 접근 X)
 * 실제 authorize 로직은 auth.ts에 위치
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const isOnLogin = request.nextUrl.pathname.startsWith('/login')

      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL('/', request.nextUrl))
        }
        return true
      }

      if (!isLoggedIn) {
        return false // → /login 으로 자동 리다이렉트
      }
      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.name = user.name
        token.team = user.team
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      session.user.name = token.name as string
      session.user.team = token.team as string | undefined
      return session
    },
  },
  providers: [], // auth.ts에서 채움
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
}
