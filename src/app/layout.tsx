import type { Metadata } from 'next'
import { Figtree, Geist_Mono, Noto_Sans_KR } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import { uiScaleZoom } from '@/lib/ui-scale'
import { getMyUiScale } from '@/server/queries/ui-scale'

const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
})

const notoSansKr = Noto_Sans_KR({
  variable: '--font-noto-kr',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: '에스킴 ERP',
  description: '에스킴 컴퍼니 매출·매입 통합관리',
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 사용자별 화면 배율 — 계정(users.ui_scale)에 저장, SSR 시 적용해 깜빡임 없음
  const scale = await getMyUiScale()
  return (
    // 화면 배율(zoom)은 body 가 아니라 앱 래퍼에 건다 — body 에 걸면 포털(메뉴·셀렉트·다이얼로그)이 배율만큼 어긋난 좌표에 떠서
    // 크게 설정한 사용자는 프로필 메뉴가 화면 밖에 뜸(2026-09-16 피드백). 포털 팝업은 [zoom:var(--ui-zoom)] 클래스로 자체 배율을 갖는다.
    <html
      lang="ko"
      className={`${figtree.variable} ${notoSansKr.variable} ${geistMono.variable} h-full antialiased`}
      style={{ '--ui-zoom': uiScaleZoom(scale) } as React.CSSProperties}
    >
      <body className="min-h-full">
        <div id="ui-root" className="[zoom:var(--ui-zoom,1)] min-h-full">
          {children}
        </div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
