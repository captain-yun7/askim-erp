'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createUser } from '@/server/actions/users'

const ROLE_OPTIONS = [
  { value: 'admin', label: '관리자' },
  { value: 'accountant', label: '회계' },
  { value: 'sales', label: '영업' },
  { value: 'viewer', label: '조회' },
] as const

const EMPTY = {
  name: '',
  email: '',
  password: '',
  role: 'sales' as (typeof ROLE_OPTIONS)[number]['value'],
  team: '',
  dealCodePrefix: '',
}

export function CreateUserDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  function submit() {
    startTransition(async () => {
      const res = await createUser(form)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('사용자가 등록되었습니다')
      setForm(EMPTY)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="gap-1.5">
            <Plus className="size-4" />새 사용자
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 사용자 등록</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>이름 *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>이메일 *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>임시 비밀번호 *</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="6자 이상"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>역할</Label>
            <Select
              value={form.role}
              onValueChange={(v) => v && set('role', v as typeof form.role)}
            >
              <SelectTrigger>
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>팀</Label>
              <Input value={form.team} onChange={(e) => set('team', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>거래코드 prefix</Label>
              <Input
                value={form.dealCodePrefix}
                onChange={(e) => set('dealCodePrefix', e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            disabled={pending || !form.name.trim() || !form.email.trim() || !form.password}
            onClick={submit}
          >
            {pending ? '등록 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
