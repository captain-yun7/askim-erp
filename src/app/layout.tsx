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
    <html
      lang="ko"
      className={`${figtree.variable} ${notoSansKr.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" style={{ zoom: uiScaleZoom(scale) }}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
