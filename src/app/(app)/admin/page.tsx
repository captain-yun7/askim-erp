import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Database, Users } from 'lucide-react'
import { canManageUsers, getSessionUser } from '@/server/auth/guards'

const CARDS = [
  {
    href: '/admin/users',
    title: '사용자 관리',
    desc: '계정 등록·역할 변경·활성화 관리',
    Icon: Users,
  },
  {
    href: '/admin/lookups',
    title: 'Lookup 마스터',
    desc: '상품구분·계정항목·매출수단·거래항목 관리',
    Icon: Database,
  },
]

export default async function AdminHomePage() {
  const user = await getSessionUser()
  if (!user || !canManageUsers(user.role)) redirect('/')

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">관리자</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          사용자 및 기준정보 마스터 관리
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ href, title, desc, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-xl border bg-card p-5 transition-colors hover:bg-accent/40"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="font-semibold group-hover:text-primary">
                {title}
              </span>
              <span className="mt-0.5 text-sm text-muted-foreground">
                {desc}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
