'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveAnnualSalesTarget } from '@/server/actions/plan'

export function AnnualTargetForm({
  year,
  initial,
  editable,
}: {
  year: number
  initial: number | null
  editable: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [value, setValue] = useState(initial != null ? String(initial) : '')

  if (!editable) return null

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await saveAnnualSalesTarget({
            year,
            annualSalesTarget: Number(value.replace(/,/g, '')),
          })
          if ('error' in res) toast.error(res.error)
          else {
            toast.success('연 목표매출 저장')
            router.refresh()
          }
        })
      }}
    >
      <label className="text-[12.5px] text-muted-foreground">연 목표매출</label>
      <Input
        className="h-9 w-44 text-right font-mono tabular-nums"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="8,800,000,000"
      />
      <Button type="submit" size="sm" className="h-9" disabled={pending}>
        저장
      </Button>
    </form>
  )
}
