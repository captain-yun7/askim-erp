'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Check, ChevronDown, Download, Search } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Cat = { id: number; nameKo: string }
type User = { id: string; name: string }

const chip =
  'h-9 gap-1.5 rounded-lg border bg-background px-3 text-[12.5px] font-medium data-[active=true]:border-primary data-[active=true]:bg-accent data-[active=true]:text-primary'

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
    ownerUserIds?: string[]
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
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={initial.q ?? ''}
          placeholder="거래코드, 거래처, 품목 검색..."
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
          <span className="text-muted-foreground">귀속연도</span>
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
          <span className="text-muted-foreground">상품구분</span>
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

      <OwnerMultiSelect
        users={users}
        selected={initial.ownerUserIds ?? []}
        onChange={(ids) => update({ owner: ids.length ? ids.join(',') : undefined })}
      />

      <Select
        defaultValue={initial.paid ?? 'all'}
        onValueChange={(v) => update({ paid: v ?? undefined })}
      >
        <SelectTrigger
          className={cn(chip)}
          data-active={Boolean(initial.paid && initial.paid !== 'all')}
        >
          <SelectValue />
          <span className="text-muted-foreground">상태</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          <SelectItem value="unpaid">미입금만</SelectItem>
          <SelectItem value="unsettled">미결산만</SelectItem>
        </SelectContent>
      </Select>

      <button
        type="button"
        title="내보내기"
        className="ml-auto grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-accent"
      >
        <Download className="size-4" />
      </button>
    </div>
  )
}

/** 담당자 다중 선택 — 체크박스 팝오버, URL 은 owner=id1,id2 */
function OwnerMultiSelect({
  users,
  selected,
  onChange,
}: {
  users: User[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  // 연속 클릭 시 URL 반영 전 stale prop 으로 덮어쓰지 않도록 로컬 상태 유지, prop 바뀌면 동기화
  const propKey = selected.join(',')
  const [syncedKey, setSyncedKey] = useState(propKey)
  const [local, setLocal] = useState(selected)
  if (syncedKey !== propKey) {
    setSyncedKey(propKey)
    setLocal(selected)
  }

  const names = users.filter((u) => local.includes(u.id)).map((u) => u.name)
  const summary =
    names.length === 0 ? '전체' : names.length <= 2 ? names.join(', ') : `${names[0]} 외 ${names.length - 1}명`

  function apply(ids: string[]) {
    setLocal(ids)
    onChange(ids)
  }
  function toggle(id: string) {
    apply(local.includes(id) ? local.filter((x) => x !== id) : [...local, id])
  }

  return (
    <Popover>
      <PopoverTrigger className={cn(chip, 'inline-flex items-center')} data-active={local.length > 0}>
        <span className="max-w-40 truncate">{summary}</span>
        <span className="text-muted-foreground">담당자</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-0 p-1">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px] hover:bg-accent"
          onClick={() => apply([])}
        >
          전체
          {local.length === 0 && <Check className="size-3.5 text-primary" />}
        </button>
        <div className="my-1 h-px bg-border" />
        <div className="max-h-72 overflow-y-auto">
          {users.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-accent"
            >
              <Checkbox checked={local.includes(u.id)} onCheckedChange={() => toggle(u.id)} />
              {u.name}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
