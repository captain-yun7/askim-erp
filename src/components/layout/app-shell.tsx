'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FileBarChart,
  LayoutDashboard,
  Receipt,
  Settings,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  CalendarCheck,
  Target,
} from 'lucide-react'
import { logoutAction } from '@/server/actions/auth'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type NavItem = {
  href: string
  label: string
  icon: typeof Receipt
  exact?: boolean
  soon?: boolean
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '메인',
    items: [{ href: '/', label: '대시보드', icon: LayoutDashboard, exact: true }],
  },
  {
    title: '영업',
    items: [
      { href: '/deals', label: '거래', icon: Receipt },
      { href: '/counterparties', label: '거래처', icon: Users },
      { href: '/expenses', label: '판관비', icon: Wallet },
    ],
  },
  {
    title: '리포트',
    items: [
      { href: '/reports/ledger', label: '매출장표', icon: FileBarChart },
      { href: '/reports/collection', label: '월별 수금결산', icon: CalendarCheck },
      { href: '/reports/plan', label: '매출목표·현금흐름', icon: Target },
      { href: '/reports/pnl', label: '월별 손익', icon: TrendingUp },
      { href: '/reports/top-counterparties', label: 'TOP 거래처', icon: Trophy },
    ],
  },
]

const ADMIN_SECTION: { title: string; items: NavItem[] } = {
  title: '관리',
  items: [{ href: '/admin', label: '사용자·설정', icon: Settings }],
}

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: string; team?: string }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const sections =
    user.role === 'admin' ? [...NAV_SECTIONS, ADMIN_SECTION] : NAV_SECTIONS
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-58 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground md:flex">
        <Link href="/" className="flex items-center gap-2 px-2.5 pb-5 pt-1.5">
          <Image src="/brand/askim-symbol.png" alt="" width={44} height={17} priority />
          <Image
            src="/brand/askim-wordmark-white.png"
            alt="ASKIM"
            width={46}
            height={13}
            className="invert"
            priority
          />
          <span className="text-[12px] font-medium tracking-wide text-subtle-foreground">ERP</span>
        </Link>
        <nav className="flex flex-col gap-4">
          {sections.map((section) => (
            <div key={section.title} className="flex flex-col gap-0.5">
              <span className="px-3 pb-1 text-[11px] font-medium tracking-[0.04em] text-subtle-foreground">
                {section.title}
              </span>
              {section.items.map((item) => {
                const Icon = item.icon
                if (item.soon) {
                  return (
                    <span
                      key={item.href}
                      className="flex h-9 cursor-default items-center gap-2.5 rounded-full px-3 text-sm font-medium text-subtle-foreground"
                    >
                      <Icon className="size-4" strokeWidth={1.5} />
                      {item.label}
                      <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-subtle-foreground">
                        준비중
                      </span>
                    </span>
                  )
                }
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex h-9 items-center gap-2.5 rounded-full px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <Icon className="size-4" strokeWidth={1.5} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border pt-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
                    {user.name.slice(0, 1)}
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13px] font-medium text-foreground">
                      {user.name}
                    </span>
                    <span className="text-[11px] text-subtle-foreground">
                      {user.team ?? user.role}
                    </span>
                  </span>
                </button>
              }
            />
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/profile">내 프로필</Link>} />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logoutAction()}>
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto bg-background">{children}</main>
    </div>
  )
}
