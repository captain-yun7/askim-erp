'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { saveTeamLeadScope } from '@/server/actions/app-settings'

const OPTIONS = [
  { value: 'all', label: '전체', desc: '모든 팀의 거래·보증금을 조회합니다' },
  { value: 'team', label: '자기 팀만', desc: '같은 팀 담당자의 거래·보증금만 조회합니다' },
] as const

/** 관리자 홈 — 팀장 조회 범위 (2026-09-16 피드백). 수정은 범위와 무관하게 본인 거래만 */
export function TeamLeadScopeSetting({ current }: { current: 'all' | 'team' }) {
  const [value, setValue] = useState(current)
  const [pending, start] = useTransition()

  function choose(next: 'all' | 'team') {
    if (next === value || pending) return
    const prev = value
    setValue(next)
    start(async () => {
      const res = await saveTeamLeadScope(next)
      if ('error' in res) {
        setValue(prev)
        toast.error(res.error)
        return
      }
      toast.success(`팀장 조회 범위가 '${next === 'all' ? '전체' : '자기 팀만'}'(으)로 저장되었습니다`)
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="font-medium">팀장 조회 범위</div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        팀장 계정이 거래·보증금 목록에서 볼 수 있는 범위입니다. 팀원은 항상 본인 것만, 수정은 팀장도 본인 거래만 가능합니다.
      </p>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label="팀장 조회 범위">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={pending}
            onClick={() => choose(o.value)}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
              value === o.value ? 'border-primary bg-muted' : 'hover:bg-muted/60',
            )}
          >
            <span className={cn('mt-1 grid size-3.5 shrink-0 place-items-center rounded-full border', value === o.value && 'border-primary')}>
              {value === o.value && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
