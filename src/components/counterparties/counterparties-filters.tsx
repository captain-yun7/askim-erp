'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CLIENT_TYPES } from '@/lib/client-type'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const chip =
  'h-9 gap-1.5 rounded-lg border bg-background px-3 text-[12.5px] font-medium data-[active=true]:border-primary data-[active=true]:bg-accent data-[active=true]:text-primary'

const ROLES = [
  { value: 'media', label: '매체사' },
  { value: 'advertiser', label: '광고주' },
  { value: 'agency', label: '대행사' },
]

export function CounterpartiesFilters({
  initial,
}: {
  initial: { q?: string; role?: string; noBiz?: boolean; ctype?: string }
}) {
  const router = useRouter()
  const sp = useSearchParams()

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === 'all') next.delete(k)
      else next.set(k, v)
    }
    router.push(`/counterparties?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={initial.q ?? ''}
          placeholder="상호명, 사업자번호 검색..."
          className="h-9 rounded-lg pl-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              update({ q: (e.target as HTMLInputElement).value })
          }}
        />
      </div>

      <Select
        defaultValue={initial.role ?? 'all'}
        onValueChange={(v) => update({ role: v ?? undefined })}
      >
        <SelectTrigger className={chip} data-active={Boolean(initial.role)}>
          <SelectValue />
          <span className="text-muted-foreground">역할</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          {ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select defaultValue={initial.ctype ?? 'all'} onValueChange={(v) => update({ ctype: v ?? undefined })}>
        <SelectTrigger className={chip} data-active={Boolean(initial.ctype)} aria-label="거래처 구분">
          <SelectValue />
          <span className="text-muted-foreground">구분</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          <SelectItem value="none">미지정</SelectItem>
          {CLIENT_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        type="button"
        data-active={initial.noBiz}
        onClick={() => update({ noBiz: initial.noBiz ? undefined : '1' })}
        className={chip}
      >
        사업자번호 없는 곳만
      </button>
    </div>
  )
}
