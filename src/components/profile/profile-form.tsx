'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateProfile } from '@/server/actions/profile'

export function ProfileForm({
  initial,
}: {
  initial: { name: string; email: string; role: string; team?: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(initial.name)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  function handleSubmit() {
    startTransition(async () => {
      const res = await updateProfile({ name, currentPassword, newPassword })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('프로필이 저장되었습니다')
      setCurrentPassword('')
      setNewPassword('')
      router.refresh()
    })
  }

  return (
    <Card className="max-w-lg">
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-1.5">
          <Label>이메일</Label>
          <Input value={initial.email} disabled className="bg-muted" />
        </div>
        <div className="grid gap-1.5">
          <Label>역할 / 팀</Label>
          <Input
            value={`${initial.role}${initial.team ? ` · ${initial.team}` : ''}`}
            disabled
            className="bg-muted"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>이름 *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="mt-2 border-t pt-4">
          <p className="mb-3 text-sm font-semibold">비밀번호 변경 (선택)</p>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>현재 비밀번호</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>새 비밀번호 (8자 이상)</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        <div className="mt-2 flex justify-end">
          <Button disabled={pending} onClick={handleSubmit}>
            {pending ? '저장 중...' : '저장'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
