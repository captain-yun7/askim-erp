'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Receipt, Users, Wallet } from 'lucide-react'
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

const NAV = [
  { href: '/deals', label: '거래', icon: Receipt },
  { href: '/counterparties', label: '거래처', icon: Users },
  { href: '/expenses', label: '판관비', icon: Wallet },
]

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: string; team?: string }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-58 shrink-0 flex-col bg-zinc-900 p-3.5 text-zinc-400 md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-4 pt-1.5">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BarChart3 className="size-4" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-white">
            에스킴 ERP
          </span>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-zinc-800 font-semibold text-white'
                    : 'hover:bg-zinc-800 hover:text-white',
                )}
              >
                <Icon className="size-[17px]" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto border-t border-zinc-700 pt-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-800">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {user.name.slice(0, 1)}
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-[13px] font-semibold text-white">
                      {user.name}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {user.team ?? user.role}
                    </span>
                  </span>
                </button>
              }
            />
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
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
