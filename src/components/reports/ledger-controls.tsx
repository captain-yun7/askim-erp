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

const toggle =
  'h-9 px-3.5 text-[12.5px] font-medium transition-colors data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'

export function LedgerControls({
  year,
  basis,
}: {
  year: number
  basis: 'accrual' | 'cash'
}) {
  const router = useRouter()
  const sp = useSearchParams()

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k)
      else next.set(k, v)
    }
    router.push(`/reports/ledger?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Select
        defaultValue={String(year)}
        onValueChange={(v) => update({ year: v ?? undefined })}
      >
        <SelectTrigger className={chip} data-active>
          <SelectValue />
          <span className="text-muted-foreground">연도</span>
        </SelectTrigger>
        <SelectContent>
          {[2023, 2024, 2025, 2026, 2027].map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="inline-flex overflow-hidden rounded-lg border bg-background">
        <button
          type="button"
          className={cn(toggle)}
          data-active={basis === 'accrual'}
          onClick={() => update({ basis: 'accrual' })}
        >
          귀속월 기준
        </button>
        <span className="w-px self-stretch bg-border" />
        <button
          type="button"
          className={cn(toggle)}
          data-active={basis === 'cash'}
          onClick={() => update({ basis: 'cash' })}
        >
          통장 기준
        </button>
      </div>

      <span className="text-[11.5px] text-muted-foreground">
        {basis === 'accrual'
          ? '발생주의 · 귀속연월 집계'
          : '현금주의 · 입금/지급일 집계'}
      </span>
    </div>
  )
}
