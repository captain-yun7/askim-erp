'use client'

import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'
import { CLIENT_TYPES } from '@/lib/client-type'
import { setCounterpartyClientType } from '@/server/actions/counterparties'
import { cn } from '@/lib/utils'

/** 보고서 표 안에서 거래처 구분을 바로 지정 — 미지정이 눈에 띄게 */
export function ClientTypeSelect({ counterpartyId, name, value }: { counterpartyId: string; name: string; value: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [shown, setShown] = useOptimistic(value)
  return (
    <select
      aria-label={`${name} 구분`}
      disabled={pending}
      value={shown ?? ''}
      className={cn(
        'h-7 rounded-md border bg-background px-1.5 text-[12.5px]',
        !shown && 'border-dashed text-muted-foreground',
        pending && 'opacity-70',
      )}
      onChange={(e) => {
        const next = e.target.value || null
        start(async () => {
          setShown(next)
          const res = await setCounterpartyClientType([counterpartyId], next)
          if ('error' in res) {
            toast.error(res.error)
            return
          }
          router.refresh()
        })
      }}
    >
      <option value="">미지정</option>
      {CLIENT_TYPES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  )
}
