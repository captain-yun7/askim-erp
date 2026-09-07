'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { deleteExpense, updateExpense } from '@/server/actions/expenses'

export type ExpenseRowData = {
  id: string
  date: string
  itemName: string | null
  counterpartyText: string | null
  amount: string
  expenseCategoryId: number | null
  paymentMethod: string
}

const PAYMENT_OPTIONS = [
  { value: 'corporate_card', label: '법인카드' },
  { value: 'personal_card', label: '개인카드' },
  { value: 'cash', label: '현금' },
  { value: 'bank_transfer', label: '이체' },
]

const selectClass = 'h-9 w-full rounded-lg border bg-background px-2 text-sm'

/** 판관비 목록 행의 수정·삭제 (회계/admin, 영업은 본인 입력건) */
export function ExpenseRowActions({
  row,
  categories,
  canEdit,
  canDelete,
}: {
  row: ExpenseRowData
  categories: { id: number; nameKo: string }[]
  canEdit: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [form, setForm] = useState({
    expenseDate: row.date,
    itemName: row.itemName ?? '',
    counterpartyText: row.counterpartyText ?? '',
    amount: String(Math.round(parseFloat(row.amount))),
    expenseCategoryId: row.expenseCategoryId,
    paymentMethod: row.paymentMethod,
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }))

  if (!canEdit && !canDelete) return null

  function submit() {
    start(async () => {
      const res = await updateExpense(row.id, form)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('수정되었습니다')
      setOpen(false)
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm(`'${row.itemName ?? row.date}' 지출을 삭제할까요? 리포트 합계에서도 제외됩니다.`)) return
    start(async () => {
      const res = await deleteExpense(row.id)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('삭제되었습니다')
      router.refresh()
    })
  }

  return (
    <div className="flex justify-end gap-0.5">
      {canEdit && (
        <Button variant="ghost" size="icon" className="size-7" title="수정" disabled={pending} onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" />
        </Button>
      )}
      {canDelete && (
        <Button variant="ghost" size="icon" className="size-7 text-destructive" title="삭제" disabled={pending} onClick={remove}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>판관비 수정</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="exp-date">지출일 *</Label>
                <Input id="exp-date" type="date" value={form.expenseDate} onChange={(e) => set('expenseDate', e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="exp-amount">금액 *</Label>
                <Input id="exp-amount" inputMode="numeric" className="text-right" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="exp-item">품목</Label>
              <Input id="exp-item" value={form.itemName} onChange={(e) => set('itemName', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="exp-cp">거래처</Label>
              <Input id="exp-cp" value={form.counterpartyText} onChange={(e) => set('counterpartyText', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="exp-cat">항목</Label>
                <select
                  id="exp-cat"
                  className={selectClass}
                  value={form.expenseCategoryId ?? ''}
                  onChange={(e) => set('expenseCategoryId', e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">-</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameKo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="exp-method">수단</Label>
                <select id="exp-method" className={selectClass} value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
                  {PAYMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button disabled={pending || !form.expenseDate || !form.amount.trim()} onClick={submit}>
              {pending ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
