'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'
import { saveLedgerOverride } from '@/server/actions/ledger-override'

/**
 * 매출장표 수기 입력 셀 — 클릭 → 입력 → Enter/blur 저장.
 * 빈 값 저장 시 수기값 삭제(자동 집계 복원). 수기값은 좌측 점으로 표시.
 */
export function LedgerEditableCell({
  year,
  month,
  field,
  value,
  overridden,
}: {
  year: number
  month: number
  field: 'sales_accrual' | 'cogs_accrual'
  value: number
  overridden: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function open() {
    setDraft(value ? String(Math.round(value)) : '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const cleaned = draft.replace(/,/g, '').trim()
    const amount = cleaned === '' ? null : Number(cleaned)
    if (amount !== null && !Number.isFinite(amount)) {
      toast.error('숫자를 입력해 주세요')
      return
    }
    // 변화 없으면 스킵 (자동값 상태에서 같은 값 입력은 override 생성이므로 진행)
    if (amount !== null && overridden && Math.round(value) === amount) return
    if (amount === null && !overridden) return
    start(async () => {
      const res = await saveLedgerOverride({ year, month, field, amount })
      if ('error' in res) toast.error(res.error)
      else {
        toast.success(amount === null ? '자동 집계로 복원' : '수기값 저장')
        router.refresh()
      }
    })
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="h-6 w-28 rounded border border-primary bg-background px-1 text-right font-mono text-[12.5px] tabular-nums outline-none"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button
      type="button"
      title={overridden ? '수기 입력값 (지우고 저장하면 자동 집계 복원)' : '클릭해서 수기 입력'}
      className={cn(
        'inline-flex w-full items-center justify-end gap-1 rounded px-0.5 text-right tabular-nums hover:bg-accent/60',
        pending && 'opacity-50',
        value < 0 && 'text-destructive',
      )}
      onClick={open}
    >
      {overridden && <span className="size-1.5 shrink-0 rounded-full bg-primary" title="수기값" />}
      {Math.round(value) ? formatKRW(Math.round(value)) : <span className="text-muted-foreground/60">0</span>}
    </button>
  )
}
