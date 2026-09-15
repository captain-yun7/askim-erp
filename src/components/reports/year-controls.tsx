'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const YEARS = [2023, 2024, 2025, 2026, 2027]

/** 리포트 공용 연도 선택 버튼 — ?year= 만 바꿔 같은 경로로 이동 */
export function YearControls({ year, basePath }: { year: number; basePath: string }) {
  const router = useRouter()
  const sp = useSearchParams()

  function select(y: number) {
    const next = new URLSearchParams(sp.toString())
    next.set('year', String(y))
    router.push(`${basePath}?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {YEARS.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => select(y)}
          data-active={y === year}
          className={cn(
            'h-9 rounded-lg border bg-background px-3.5 text-[12.5px] font-medium transition-colors hover:bg-accent',
            'data-[active=true]:border-primary data-[active=true]:bg-accent data-[active=true]:text-primary',
          )}
        >
          {y}
        </button>
      ))}
    </div>
  )
}
