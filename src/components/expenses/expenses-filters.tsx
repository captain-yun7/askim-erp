'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Cat = { id: number; nameKo: string }

const chip =
  'h-9 gap-1.5 rounded-lg border bg-background px-3 text-[12.5px] font-medium data-[active=true]:border-primary data-[active=true]:bg-accent data-[active=true]:text-primary'

const PAYMENT_METHODS = [
  { value: 'corporate_card', label: '법인카드' },
  { value: 'personal_card', label: '개인카드' },
  { value: 'cash', label: '현금' },
  { value: 'bank_transfer', label: '이체' },
]

export function ExpensesFilters({
  categories,
  initial,
}: {
  categories: Cat[]
  initial: {
    q?: string
    year?: number
    month?: number
    categoryId?: number
    method?: string
  }
}) {
  const router = useRouter()
  const sp = useSearchParams()

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === 'all') next.delete(k)
      else next.set(k, v)
    }
    router.push(`/expenses?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={initial.q ?? ''}
          placeholder="품목, 거래처 검색..."
          className="h-9 rounded-lg pl-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              update({ q: (e.target as HTMLInputElement).value })
          }}
        />
      </div>

      <Select
        defaultValue={initial.year ? String(initial.year) : 'all'}
        onValueChange={(v) => update({ year: v ?? undefined })}
      >
        <SelectTrigger className={chip} data-active={Boolean(initial.year)}>
          <SelectValue />
          <span className="text-muted-foreground">연도</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          {[2023, 2024, 2025, 2026, 2027].map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue={initial.month ? String(initial.month) : 'all'}
        onValueChange={(v) => update({ month: v ?? undefined })}
      >
        <SelectTrigger className={chip} data-active={Boolean(initial.month)}>
          <SelectValue />
          <span className="text-muted-foreground">월</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <SelectItem key={m} value={String(m)}>
              {m}월
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue={initial.categoryId ? String(initial.categoryId) : 'all'}
        onValueChange={(v) => update({ categoryId: v ?? undefined })}
      >
        <SelectTrigger className={chip} data-active={Boolean(initial.categoryId)}>
          <SelectValue />
          <span className="text-muted-foreground">항목</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.nameKo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue={initial.method ?? 'all'}
        onValueChange={(v) => update({ method: v ?? undefined })}
      >
        <SelectTrigger className={chip} data-active={Boolean(initial.method)}>
          <SelectValue />
          <span className="text-muted-foreground">결제수단</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          {PAYMENT_METHODS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
