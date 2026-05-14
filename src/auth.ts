import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

// 실제 user 검증은 schema/user.ts 작성 후 구현됩니다.
// 현재는 Auth.js 스켈레톤만 잡아두고, 다음 태스크에서 채웁니다.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize() {
        // TODO: user 스키마 작성 후 bcrypt 검증 추가
        return null
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login' },
})
