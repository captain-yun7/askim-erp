'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createExpenses } from '@/server/actions/expenses'
import { formatKRW } from '@/lib/format'

type Lookups = {
  expenseCategories: { id: number; nameKo: string }[]
  users: { id: string; name: string }[]
}

type Row = {
  key: number
  expenseDate: string
  itemName: string
  counterpartyText: string
  amount: string
  expenseCategoryId: number | null
}

const PAYMENT_OPTIONS = [
  { value: 'corporate_card', label: '법인카드' },
  { value: 'personal_card', label: '개인카드' },
  { value: 'cash', label: '현금' },
  { value: 'bank_transfer', label: '이체' },
] as const

function today() {
  return new Date().toISOString().slice(0, 10)
}

let nextKey = 1
function emptyRow(): Row {
  return {
    key: nextKey++,
    expenseDate: today(),
    itemName: '',
    counterpartyText: '',
    amount: '',
    expenseCategoryId: null,
  }
}

export function ExpenseForm({ lookups }: { lookups: Lookups }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(), emptyRow(), emptyRow()])
  const [paymentMethod, setPaymentMethod] = useState<string>('corporate_card')
  const [payerUserId, setPayerUserId] = useState<string | null>(null)

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((p) => [...p, emptyRow()])
  }

  function removeRow(key: number) {
    setRows((p) => (p.length > 1 ? p.filter((r) => r.key !== key) : p))
  }

  const totalAmount = rows.reduce((sum, r) => {
    const n = parseFloat(r.amount.replace(/,/g, ''))
    return sum + (isNaN(n) ? 0 : n)
  }, 0)

  function handleSave() {
    const payload = {
      paymentMethod,
      payerUserId,
      rows: rows.map((r) => ({
        expenseDate: r.expenseDate,
        itemName: r.itemName,
        counterpartyText: r.counterpartyText,
        amount: r.amount,
        expenseCategoryId: r.expenseCategoryId,
      })),
    }
    startTransition(async () => {
      const res = await createExpenses(payload)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('판관비가 저장되었습니다')
      router.push('/expenses')
      router.refresh()
    })
  }

  return (
    <div className="px-8 py-6">
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[140px]">지출일</TableHead>
                  <TableHead>품목</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead className="w-[160px] text-right">금액</TableHead>
                  <TableHead className="w-[160px]">항목</TableHead>
                  <TableHead className="w-[48px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key} className="hover:bg-transparent">
                    <TableCell>
                      <Input
                        type="date"
                        value={r.expenseDate}
                        onChange={(e) => updateRow(r.key, { expenseDate: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.itemName}
                        onChange={(e) => updateRow(r.key, { itemName: e.target.value })}
                        placeholder="품목명"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.counterpartyText}
                        onChange={(e) =>
                          updateRow(r.key, { counterpartyText: e.target.value })
                        }
                        placeholder="거래처"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={r.amount}
                        onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                        className="text-right font-mono"
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={
                          r.expenseCategoryId ? String(r.expenseCategoryId) : ''
                        }
                        onValueChange={(v) =>
                          updateRow(r.key, {
                            expenseCategoryId: v ? Number(v) : null,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="항목" />
                        </SelectTrigger>
                        <SelectContent>
                          {lookups.expenseCategories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.nameKo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(r.key)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />행 추가
            </Button>
            <div className="text-sm text-muted-foreground">
              합계{' '}
              <b className="text-foreground tabular-nums">₩{formatKRW(totalAmount)}</b>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>지출수단</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => v && setPaymentMethod(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>지출자</Label>
            <Select
              value={payerUserId ?? ''}
              onValueChange={(v) => setPayerUserId(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="지출자 선택" />
              </SelectTrigger>
              <SelectContent>
                {lookups.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/expenses')}>
          ↩ 취소
        </Button>
        <Button disabled={pending} onClick={handleSave}>
          {pending ? '저장 중...' : '일괄저장'}
        </Button>
      </div>
    </div>
  )
}
