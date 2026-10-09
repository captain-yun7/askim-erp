import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AppShell } from '@/components/layout/app-shell'
import { getCurrentEntity } from '@/server/entity'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  // middleware 가 먼저 처리하지만, 어떤 경로로든 세션 없이 오면 빈 화면 대신 로그인으로
  if (!session?.user) redirect('/login')
  const entity = await getCurrentEntity()
  return <AppShell user={session.user} entity={entity}>{children}</AppShell>
}
