'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  resetUserPassword,
  toggleUserActive,
  toggleUserTeamLead,
  updateUserRole,
  updateUserTeam,
} from '@/server/actions/users'
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
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  function resetPassword() {
    if (!window.confirm(`${user.name} 님의 비밀번호를 초기화할까요? 기존 비밀번호는 즉시 무효화됩니다.`)) return
    startTransition(async () => {
      const res = await resetUserPassword(user.id)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setTempPassword(res.tempPassword)
    })
  }

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
      <TableCell className="text-right whitespace-nowrap">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={pending}
          onClick={resetPassword}
        >
          비번 초기화
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={pending}
          onClick={toggleActive}
        >
          {user.isActive ? '비활성화' : '활성화'}
        </Button>
        <Dialog open={tempPassword != null} onOpenChange={(o) => !o && setTempPassword(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>임시 비밀번호 발급</DialogTitle>
              <DialogDescription>
                {user.name} 님에게 아래 임시 비밀번호를 전달하세요. 이 창을 닫으면 다시 볼 수 없습니다.
                로그인 후 프로필에서 비밀번호를 변경하도록 안내해 주세요.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <code data-testid="temp-password" className="flex-1 select-all font-mono text-base tracking-wider">
                {tempPassword}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tempPassword ?? '')
                    toast.success('복사되었습니다')
                  } catch {
                    toast.error('복사 실패 — 직접 선택해서 복사하세요')
                  }
                }}
              >
                복사
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setTempPassword(null)}>닫기</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  )
}
