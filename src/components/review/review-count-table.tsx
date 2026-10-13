'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setReviewCount } from '@/server/actions/review-requests'
import type { ReviewCountRow } from '@/server/queries/review-requests'
import { cn } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** 셀 = 자동 집계 + 관리자 보정. 클릭해서 최종 횟수를 고친다 (예: 실수로 건 요청 1회 차감) */
function CountCell({ row, month, year }: { row: ReviewCountRow; month: number; year: number }) {
  const auto = row.auto[month - 1]
  const delta = row.delta[month - 1]
  const total = auto + delta
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  if (editing)
    return (
      <input
        autoFocus
        inputMode="numeric"
        aria-label={`${row.name} ${month}월 수정요청 횟수`}
        defaultValue={String(total)}
        className="h-7 w-12 rounded border border-primary bg-background px-1 text-right font-mono text-[13px] tabular-nums outline-none"
        onBlur={(e) => {
          setEditing(false)
          const v = e.target.value.trim()
          const n = Number(v)
          if (v === '' || n === total) return
          if (!Number.isInteger(n) || n < 0) {
            toast.error('0 이상의 정수로 입력하세요')
            return
          }
          start(async () => {
            const res = await setReviewCount({ userId: row.userId, year, month, value: n })
            if ('error' in res) toast.error(res.error)
            else toast.success(`${row.name} ${month}월 수정요청 ${n}회로 저장했습니다`)
          })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  return (
    <button
      type="button"
      data-adjusted={delta !== 0 ? '' : undefined}
      title={delta !== 0 ? `자동 ${auto}회 · 관리자 수정 ${delta > 0 ? '+' : ''}${delta}회 — 클릭해서 수정` : '클릭해서 수정'}
      className={cn(
        'min-w-8 rounded px-1 text-right tabular-nums hover:bg-accent/60',
        total === 0 && 'text-muted-foreground/50',
        delta !== 0 && 'font-semibold text-primary underline decoration-dotted underline-offset-4',
        pending && 'opacity-60',
      )}
      onClick={() => setEditing(true)}
    >
      {total}
    </button>
  )
}

export function ReviewCountTable({ rows, year }: { rows: ReviewCountRow[]; year: number }) {
  const sum = (r: ReviewCountRow) => r.auto.reduce((s, n) => s + n, 0) + r.delta.reduce((s, n) => s + n, 0)
  const monthTotal = (m: number) => rows.reduce((s, r) => s + r.auto[m - 1] + r.delta[m - 1], 0)
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-[13px]" data-slot="review-count-table">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">담당자</th>
            {MONTHS.map((m) => (
              <th key={m} className="px-2 py-2.5 text-right font-medium">{m}월</th>
            ))}
            <th className="px-4 py-2.5 text-right font-medium">합계</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={14} className="py-12 text-center text-muted-foreground">기록이 없습니다</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.userId} className="border-b last:border-b-0 hover:bg-muted/40">
              <td className="whitespace-nowrap px-4 py-1.5">{r.name}</td>
              {MONTHS.map((m) => (
                <td key={m} className="px-2 py-1.5 text-right">
                  <CountCell row={r} month={m} year={year} />
                </td>
              ))}
              <td className="px-4 py-1.5 text-right font-semibold tabular-nums">{sum(r)}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t bg-muted/40 font-medium">
              <td className="px-4 py-2">합계</td>
              {MONTHS.map((m) => (
                <td key={m} className="px-2 py-2 text-right tabular-nums">{monthTotal(m)}</td>
              ))}
              <td className="px-4 py-2 text-right tabular-nums">{rows.reduce((s, r) => s + sum(r), 0)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
