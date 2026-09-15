'use client'

import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

const selectClass = 'h-9 rounded-full border bg-background px-3 text-[13px]'

/** 감사 로그 필터 — 변경 즉시 URL 반영 */
export function AuditFilters({
  users,
  actions,
  initial,
}: {
  users: { id: string; name: string | null }[]
  actions: Record<string, string>
  initial: { from?: string; to?: string; userId?: string; action?: string; q?: string }
}) {
  const router = useRouter()
  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(window.location.search)
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k)
      else next.set(k, v)
    }
    next.delete('page')
    router.push(`/admin/audit?${next.toString()}`)
  }
  const groups = [...new Set(Object.keys(actions).map((k) => k.split('.')[0]))]
  const GROUP_LABEL: Record<string, string> = { auth: '로그인/아웃', deal: '거래', counterparty: '거래처', expense: '판관비', deposit: '보증금', contract: '전속계약·자산', attachment: '첨부', user: '사용자', profile: '프로필', lookup: '마스터', plan: '목표·잔액', setting: '설정', export: '내보내기' }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={initial.q ?? ''}
          placeholder="내용·대상·사용자 검색… (Enter)"
          className="h-9 rounded-full pl-9"
          onKeyDown={(e) => e.key === 'Enter' && update({ q: (e.target as HTMLInputElement).value })}
        />
      </div>
      <input type="date" aria-label="시작일" className={selectClass} defaultValue={initial.from ?? ''} onChange={(e) => update({ from: e.target.value })} />
      <span className="text-muted-foreground">~</span>
      <input type="date" aria-label="종료일" className={selectClass} defaultValue={initial.to ?? ''} onChange={(e) => update({ to: e.target.value })} />
      <select aria-label="사용자" className={selectClass} value={initial.userId ?? ''} onChange={(e) => update({ user: e.target.value })}>
        <option value="">전체 사용자</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name ?? u.id}
          </option>
        ))}
      </select>
      <select aria-label="행위" className={selectClass} value={initial.action ?? ''} onChange={(e) => update({ action: e.target.value })}>
        <option value="">전체 행위</option>
        {groups.map((g) => (
          <optgroup key={g} label={GROUP_LABEL[g] ?? g}>
            <option value={`${g}.`}>{GROUP_LABEL[g] ?? g} 전체</option>
            {Object.entries(actions)
              .filter(([k]) => k.startsWith(`${g}.`))
              .map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {(initial.q || initial.from || initial.to || initial.userId || initial.action) && (
        <button type="button" className="text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => router.push('/admin/audit')}>
          필터 초기화
        </button>
      )}
    </div>
  )
}
