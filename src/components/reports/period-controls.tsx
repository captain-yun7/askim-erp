'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const YEARS = [2023, 2024, 2025, 2026, 2027]
const chip =
  'h-8 rounded-lg border bg-background px-3 text-[12.5px] font-medium transition-colors hover:bg-accent data-[active=true]:border-primary data-[active=true]:bg-accent data-[active=true]:text-primary'

/** 연도 + 월 선택 (매출분석보고서) — ?year=&month= 만 바꿔 같은 경로로 이동. 월 "전체"는 연간 */
export function PeriodControls({ year, month, basePath }: { year: number; month: number | null; basePath: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  function go(patch: { year?: number; month?: number | null }) {
    const next = new URLSearchParams(sp.toString())
    if (patch.year !== undefined) next.set('year', String(patch.year))
    if (patch.month !== undefined) {
      if (patch.month === null) next.set('month', 'all')
      else next.set('month', String(patch.month))
    }
    router.push(`${basePath}?${next.toString()}`)
  }
  return (
    <div className="flex flex-col gap-2" data-slot="period-controls">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="연도">
        <span className="w-10 text-[12px] text-muted-foreground">연도</span>
        {YEARS.map((y) => (
          <button key={y} type="button" data-active={y === year} className={chip} onClick={() => go({ year: y })}>
            {y}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="월">
        <span className="w-10 text-[12px] text-muted-foreground">월</span>
        <button type="button" data-active={month === null} className={chip} onClick={() => go({ month: null })}>
          전체
        </button>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <button key={m} type="button" data-active={m === month} className={cn(chip, 'px-2.5')} onClick={() => go({ month: m })}>
            {m}월
          </button>
        ))}
      </div>
    </div>
  )
}
