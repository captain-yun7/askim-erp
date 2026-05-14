'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCounterparty } from '@/server/actions/counterparties'
import { toast } from 'sonner'

/** 거래 폼 안에서 모달로 신규 거래처 빠르게 등록 */
export function CounterpartyQuickCreate({
  name: initialName,
  onClose,
  onCreated,
}: {
  name: string
  onClose: () => void
  onCreated: (id: string, name: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(initialName)
  const [businessNo, setBusinessNo] = useState('')
  const [memo, setMemo] = useState('')

  function submit() {
    startTransition(async () => {
      const res = await createCounterparty({
        name,
        businessNo: businessNo || null,
        memo: memo || null,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.counterparty) {
        onCreated(res.counterparty.id, res.counterparty.name)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>신규 거래처</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>상호명 *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label>사업자번호</Label>
            <Input
              value={businessNo}
              onChange={(e) => setBusinessNo(e.target.value)}
              placeholder="000-00-00000 (선택)"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>메모</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
