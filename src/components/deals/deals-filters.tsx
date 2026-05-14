'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Cat = { id: number; nameKo: string }
type User = { id: string; name: string }

export function DealsFilters({
  categories,
  users,
  initial,
}: {
  categories: Cat[]
  users: User[]
  initial: {
    q?: string
    year?: number
    month?: number
    categoryId?: number
    ownerUserId?: string
    paid?: string
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
    next.delete('page')
    router.push(`/deals?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grow basis-64">
        <label className="mb-1 block text-xs text-zinc-500">검색</label>
        <Input
          defaultValue={initial.q ?? ''}
          placeholder="거래코드, 거래처, 품목..."
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              update({ q: (e.target as HTMLInputElement).value })
          }}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">귀속연도</label>
        <Select
          defaultValue={initial.year ? String(initial.year) : 'all'}
          onValueChange={(v) => update({ year: v ?? undefined })}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
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
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">월</label>
        <Select
          defaultValue={initial.month ? String(initial.month) : 'all'}
          onValueChange={(v) => update({ month: v ?? undefined })}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
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
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">상품구분</label>
        <Select
          defaultValue={initial.categoryId ? String(initial.categoryId) : 'all'}
          onValueChange={(v) => update({ categoryId: v ?? undefined })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
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
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">담당자</label>
        <Select
          defaultValue={initial.ownerUserId ?? 'all'}
          onValueChange={(v) => update({ owner: v ?? undefined })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">상태</label>
        <Select
          defaultValue={initial.paid ?? 'all'}
          onValueChange={(v) => update({ paid: v ?? undefined })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="unpaid">미입금만</SelectItem>
            <SelectItem value="unsettled">미결산만</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
