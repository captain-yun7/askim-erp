'use client'

import { useLayoutEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { formatAmountInput, unformatAmountInput } from '@/lib/loose-date'

/**
 * 금액 입력 — 치는 동안 천 단위 쉼표를 붙여 보여 준다 (2026-09-17 피드백). onChange 에는 쉼표 없는 원시값을 넘긴다.
 * 쉼표가 끼어들어도 커서가 제자리에 있도록 "커서 앞 숫자 개수"를 기준으로 위치를 복원한다.
 */
export function AmountInput({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string | number | null | undefined
  onChange: (raw: string | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const caretDigits = useRef<number | null>(null)
  const shown = formatAmountInput(value)

  useLayoutEffect(() => {
    const el = ref.current
    const want = caretDigits.current
    if (!el || want === null || document.activeElement !== el) return
    caretDigits.current = null
    let pos = 0
    let seen = 0
    while (pos < shown.length && seen < want) {
      if (/[\d.-]/.test(shown[pos])) seen++
      pos++
    }
    el.setSelectionRange(pos, pos)
  }, [shown])

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      value={shown}
      onChange={(e) => {
        const el = e.target
        const before = el.value.slice(0, el.selectionStart ?? el.value.length)
        caretDigits.current = before.replace(/[^\d.-]/g, '').length
        onChange(unformatAmountInput(el.value) || null)
      }}
    />
  )
}
