import { auth } from '@/auth'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    // middleware가 처리하지만 안전망
    return null
  }
  return <AppShell user={session.user}>{children}</AppShell>
}
