'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PRIORITIES, type PlanGroupCode, type Priority } from '@/lib/plan-groups'
import { saveSalesTargets } from '@/server/actions/plan'

type Row = { code: PlanGroupCode; label: string; priority: Priority | null; target: number }

export function SalesTargetEditor({
  year,
  rows,
  onDone,
}: {
  year: number
  rows: Row[]
  onDone: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [state, setState] = useState(
    rows.map((r) => ({ ...r, priority: r.priority ?? '', target: String(r.target || '') })),
  )

  function set(i: number, patch: Partial<(typeof state)[number]>) {
    setState((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await saveSalesTargets({
            year,
            rows: state.map((r) => ({
              groupCode: r.code,
              priority: (r.priority || null) as Priority | null,
              targetAmount: Number(String(r.target).replace(/,/g, '')) || 0,
            })),
          })
          if ('error' in res) toast.error(res.error)
          else {
            toast.success('매출목표 저장')
            onDone()
            router.refresh()
          }
        })
      }}
    >
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b text-[12px] text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">구분</th>
            <th className="w-24 px-2 py-1.5 text-left font-medium">우선순위</th>
            <th className="w-48 px-2 py-1.5 text-right font-medium">매출목표 (VAT 제외)</th>
          </tr>
        </thead>
        <tbody>
          {state.map((r, i) => (
            <tr key={r.code} className="border-b last:border-0">
              <td className="px-2 py-1.5">{r.label}</td>
              <td className="px-2 py-1.5">
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={r.priority}
                  onChange={(e) => set(i, { priority: e.target.value as Priority | '' })}
                >
                  <option value="">-</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1.5">
                <Input
                  className="h-8 text-right font-mono tabular-nums"
                  inputMode="numeric"
                  value={r.target}
                  onChange={(e) => set(i, { target: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          저장
        </Button>
      </div>
    </form>
  )
}
