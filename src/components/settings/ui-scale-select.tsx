'use client'

import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'
import { UI_SCALES, type UiScale } from '@/lib/ui-scale'
import { setUiScaleAction } from '@/server/actions/ui-scale'
import { cn } from '@/lib/utils'

export function UiScaleSelect({ current }: { current: UiScale }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useOptimistic(current)

  function choose(next: UiScale) {
    startTransition(async () => {
      setValue(next)
      await setUiScaleAction(next)
      router.refresh()
    })
  }

  return (
    <div
      role="radiogroup"
      aria-label="글자 크기"
      className={cn('inline-flex gap-1 rounded-full bg-muted p-1', pending && 'opacity-70')}
    >
      {UI_SCALES.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={value === s.value}
          onClick={() => choose(s.value)}
          className={cn(
            'h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors',
            value === s.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
