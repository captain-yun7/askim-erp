'use client'

import { useLayoutEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { formatAmountInput, unformatAmountInput } from '@/lib/loose-date'

/**
 * 금액 입력 — 치는 동안 천 단위 쉼표를 붙여 보여 준다 (2026-09-17 피드백). onChange 에는 쉼표 없는 원시값을 넘긴다.
 * 쉼표가 끼어들어도 커서가 제자리에 있도록 "커서 앞 숫자 개수"를 기준으로 위치를 복원한다.
 */
/** 소수점 아래 버림 — 문자열로 잘라 큰 금액에서도 오차가 없다 */
export function truncAmount(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/,/g, '').split('.')[0]
}

export function AmountInput({
  value,
  onChange,
  integer = false,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string | number | null | undefined
  onChange: (raw: string | null) => void
  /** 소수점 아래를 버리고 보여 주며 입력도 받지 않는다 (2026-09-29 요청). 손대지 않은 값은 저장된 그대로 둔다 */
  integer?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const caretDigits = useRef<number | null>(null)
  const shown = formatAmountInput(integer ? truncAmount(value) : value)

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
        const raw = unformatAmountInput(el.value)
        onChange((integer ? truncAmount(raw) : raw) || null)
      }}
    />
  )
}
