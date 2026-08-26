'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CounterpartyCombobox } from '@/components/deals/counterparty-combobox'
import { createDeal } from '@/server/actions/deals'

type Cat = { id: number; nameKo: string }
type User = { id: string; name: string }

/**
 * 목록 하단 빠른 행 추가 (엑셀처럼) — 필수 최소 필드만 입력, 거래코드 자동 채번.
 * 상세(계산서 발행일·메모 등)는 저장 후 행에서 인라인 수정하거나 상세 폼에서.
 */
export function DealQuickAdd({
  categories,
  users,
  meId,
  defaultYear,
  defaultMonth,
}: {
  categories: Cat[]
  users: User[]
  meId: string | null
  defaultYear: number
  defaultMonth: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => ({
    accrualYear: String(defaultYear),
    accrualMonth: String(defaultMonth),
    categoryId: '',
    ownerUserId: meId && users.some((u) => u.id === meId) ? meId : '',
    issuerCounterpartyId: null as string | null,
    supplierCounterpartyId: null as string | null,
    itemName: '',
    salesAmountNet: '',
    purchaseAmountNet: '',
  }))
  const set = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }))

  function submit() {
    if (!form.categoryId) {
      toast.error('상품구분을 선택해 주세요')
      return
    }
    const sales = Number(form.salesAmountNet.replace(/,/g, '')) || 0
    const purchase = Number(form.purchaseAmountNet.replace(/,/g, '')) || 0
    start(async () => {
      const res = await createDeal({
        accrualYear: Number(form.accrualYear),
        accrualMonth: Number(form.accrualMonth),
        categoryId: Number(form.categoryId),
        ownerUserId: form.ownerUserId || null,
        issuerCounterpartyId: form.issuerCounterpartyId,
        supplierCounterpartyId: form.supplierCounterpartyId,
        itemName: form.itemName || null,
        salesAmountNet: sales ? String(sales) : undefined,
        salesVat: sales ? String(Math.round(sales * 0.1)) : undefined,
        salesAmountGross: sales ? String(sales + Math.round(sales * 0.1)) : undefined,
        purchaseAmountNet: purchase ? String(purchase) : undefined,
        purchaseVat: purchase ? String(Math.round(purchase * 0.1)) : undefined,
        purchaseAmountGross: purchase ? String(purchase + Math.round(purchase * 0.1)) : undefined,
      })
      if (res.error) toast.error(res.error)
      else {
        toast.success(`거래 등록: ${'deal' in res && res.deal ? res.deal.dealCode : ''}`)
        set({ issuerCounterpartyId: null, supplierCounterpartyId: null, itemName: '', salesAmountNet: '', purchaseAmountNet: '' })
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-1.5 border-t px-4 py-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" />
        행 추가 — 목록에서 바로 거래 등록
      </button>
    )
  }

  return (
    <div className="border-t bg-accent/30 px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <L label="귀속연도">
          <Input className="h-8 w-20 font-mono" inputMode="numeric" value={form.accrualYear} onChange={(e) => set({ accrualYear: e.target.value })} />
        </L>
        <L label="귀속월">
          <Input className="h-8 w-14 font-mono" inputMode="numeric" value={form.accrualMonth} onChange={(e) => set({ accrualMonth: e.target.value })} />
        </L>
        <L label="상품구분 *">
          <select
            className="h-8 rounded-lg border bg-background px-2 text-[12.5px]"
            value={form.categoryId}
            onChange={(e) => set({ categoryId: e.target.value })}
          >
            <option value="">선택</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameKo}
              </option>
            ))}
          </select>
        </L>
        <L label="담당자">
          <select
            className="h-8 rounded-lg border bg-background px-2 text-[12.5px]"
            value={form.ownerUserId}
            onChange={(e) => set({ ownerUserId: e.target.value })}
          >
            <option value="">-</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </L>
        <L label="발행처" className="w-48">
          <CounterpartyCombobox
            value={form.issuerCounterpartyId}
            onChange={(id) => set({ issuerCounterpartyId: id })}
            placeholder="발행처 검색..."
          />
        </L>
        <L label="매체사" className="w-48">
          <CounterpartyCombobox
            value={form.supplierCounterpartyId}
            onChange={(id) => set({ supplierCounterpartyId: id })}
            placeholder="매체사 검색..."
          />
        </L>
        <L label="품목명" className="w-44">
          <Input className="h-8" value={form.itemName} onChange={(e) => set({ itemName: e.target.value })} />
        </L>
        <L label="매출금">
          <Input className="h-8 w-28 text-right font-mono" inputMode="numeric" value={form.salesAmountNet} onChange={(e) => set({ salesAmountNet: e.target.value })} />
        </L>
        <L label="매입금">
          <Input className="h-8 w-28 text-right font-mono" inputMode="numeric" value={form.purchaseAmountNet} onChange={(e) => set({ purchaseAmountNet: e.target.value })} />
        </L>
        <div className="flex gap-1.5 pb-0.5">
          <Button size="sm" className="h-8" disabled={pending} onClick={submit}>
            저장
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setOpen(false)}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        거래코드 자동 채번 · 부가세 10% 자동 · 날짜·비고 등 상세는 저장 후 행에서 바로 수정
      </p>
    </div>
  )
}

function L({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
