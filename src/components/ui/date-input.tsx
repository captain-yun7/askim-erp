'use client'

import { useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { parseLooseDate } from '@/lib/loose-date'
import { cn } from '@/lib/utils'

/**
 * 날짜 입력 — 숫자만 쳐도 되는 텍스트 칸 + 달력 버튼 (2026-09-17 피드백).
 * 브라우저 기본 date 입력은 연도 6자리를 다 채워야 월로 넘어가 불편하다는 요청 → 260917 / 20260917 / 2026-9-17 모두 허용.
 * 포커스가 칸 밖으로 나가거나 Enter 를 누르면 해석해서 onChange(YYYY-MM-DD | null) 를 부른다.
 */
export function DateInput({
  value,
  onChange,
  onCancel,
  className,
  inputClassName,
  autoFocus,
  compact,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string | null | undefined
  onChange: (v: string | null) => void
  /** Esc — 인라인 편집 취소용 */
  onCancel?: () => void
  className?: string
  inputClassName?: string
  autoFocus?: boolean
  compact?: boolean
  disabled?: boolean
  'aria-label'?: string
}) {
  const [text, setText] = useState(value ?? '')
  const [synced, setSynced] = useState(value ?? '')
  if ((value ?? '') !== synced) {
    setSynced(value ?? '')
    setText(value ?? '')
  }
  const wrap = useRef<HTMLSpanElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  function commit(raw: string) {
    const parsed = parseLooseDate(raw)
    if (parsed === 'invalid') {
      toast.error(`날짜를 알 수 없습니다: ${raw}`, { description: '예) 260917 · 2026-09-17' })
      setText(value ?? '')
      if (onCancel) onCancel()
      return
    }
    setText(parsed ?? '')
    if (parsed !== (value ?? null) || onCancel) onChange(parsed)
  }

  return (
    <span
      ref={wrap}
      className={cn('relative inline-flex w-full items-center', className)}
      onBlur={(e) => {
        // 달력 버튼·숨은 date 입력으로 포커스가 옮겨가는 건 같은 칸 안의 이동
        if (wrap.current?.contains(e.relatedTarget as Node)) return
        commit(text)
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder={compact ? 'YYYY-MM-DD' : '예) 260917'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'Escape' && onCancel) {
            setText(value ?? '')
            onCancel()
          }
        }}
        className={cn(
          compact
            ? 'h-6 w-[92px] rounded border border-primary bg-background pl-1 pr-5 font-mono text-[11px] outline-none'
            : 'h-9 w-full min-w-0 rounded-full border border-input bg-background py-1 pl-3.5 pr-9 text-base outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-muted disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm',
          inputClassName,
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="달력에서 선택"
        title="달력에서 선택"
        className={cn('absolute grid place-items-center text-muted-foreground hover:text-foreground', compact ? 'right-0.5 size-4' : 'right-2.5 size-5')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const el = picker.current
          if (!el) return
          el.value = parseLooseDate(text) && parseLooseDate(text) !== 'invalid' ? (parseLooseDate(text) as string) : ''
          if (typeof el.showPicker === 'function') el.showPicker()
          else el.focus()
        }}
      >
        <CalendarDays className={compact ? 'size-3' : 'size-4'} />
      </button>
      {/* 달력 UI 만 빌려 쓰는 숨은 date 입력 */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 size-0 opacity-0"
        onChange={(e) => {
          if (!e.target.value) return
          setText(e.target.value)
          commit(e.target.value)
        }}
      />
    </span>
  )
}
