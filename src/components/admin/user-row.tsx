'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { toggleUserActive, toggleUserTeamLead, updateUserRole, updateUserTeam } from '@/server/actions/users'
import { TEAMS } from '@/lib/teams'

export type AdminUser = {
  id: string
  name: string
  email: string
  role: 'admin' | 'accountant' | 'sales' | 'viewer'
  team: string | null
  isTeamLead: boolean
  dealCodePrefix: string | null
  isActive: boolean
}

const ROLE_OPTIONS: { value: AdminUser['role']; label: string }[] = [
  { value: 'admin', label: '관리자' },
  { value: 'accountant', label: '회계' },
  { value: 'sales', label: '영업' },
  { value: 'viewer', label: '조회' },
]

export function UserRow({ user }: { user: AdminUser }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function changeRole(role: string | null) {
    if (!role || role === user.role) return
    startTransition(async () => {
      const res = await updateUserRole(user.id, role)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('역할이 변경되었습니다')
      router.refresh()
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const res = await toggleUserActive(user.id, !user.isActive)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(user.isActive ? '비활성화되었습니다' : '활성화되었습니다')
      router.refresh()
    })
  }

  return (
    <TableRow className="hover:bg-muted/60">
      <TableCell className="font-medium">{user.name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {user.email}
      </TableCell>
      <TableCell>
        <Select
          value={user.role}
          onValueChange={changeRole}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={user.team ?? 'none'}
          disabled={pending}
          onValueChange={(team) => {
            const next = team === 'none' ? null : team
            if (next === user.team) return
            startTransition(async () => {
              const res = await updateUserTeam(user.id, next)
              if (res.error) toast.error(res.error)
              else {
                toast.success('팀이 변경되었습니다 (본인 재로그인 후 조회 범위 반영)')
                router.refresh()
              }
            })
          }}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">-</SelectItem>
            {[...new Set([...TEAMS, ...(user.team ? [user.team] : [])])].map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-center">
        <Checkbox
          checked={user.isTeamLead}
          disabled={pending || user.role !== 'sales'}
          onCheckedChange={(v) =>
            startTransition(async () => {
              const res = await toggleUserTeamLead(user.id, v === true)
              if (res.error) toast.error(res.error)
              else {
                toast.success(v ? '팀장으로 지정되었습니다' : '팀장 해제되었습니다')
                router.refresh()
              }
            })
          }
        />
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {user.dealCodePrefix ?? '-'}
      </TableCell>
      <TableCell>
        <span
          className={
            user.isActive
              ? 'inline-flex rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-medium text-success-foreground'
              : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
          }
        >
          {user.isActive ? '활성' : '비활성'}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={pending}
          onClick={toggleActive}
        >
          {user.isActive ? '비활성화' : '활성화'}
        </Button>
      </TableCell>
    </TableRow>
  )
}
