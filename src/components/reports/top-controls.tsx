'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const chip =
  'h-9 gap-1.5 rounded-lg border bg-background px-3 text-[12.5px] font-medium data-[active=true]:border-primary data-[active=true]:bg-accent data-[active=true]:text-primary'

export function TopControls({
  initial,
}: {
  initial: { year?: number; sort: 'sales' | 'profit' }
}) {
  const router = useRouter()
  const sp = useSearchParams()

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === 'all') next.delete(k)
      else next.set(k, v)
    }
    router.push(`/reports/top-counterparties?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
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

      <div className="inline-flex rounded-lg border bg-background p-0.5">
        {(
          [
            ['sales', '매출순'],
            ['profit', '손익순'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => update({ sort: value })}
            data-active={initial.sort === value}
            className={cn(
              'h-8 rounded-md px-3 text-[12.5px] font-medium text-muted-foreground transition-colors',
              'data-[active=true]:bg-accent data-[active=true]:text-primary',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
