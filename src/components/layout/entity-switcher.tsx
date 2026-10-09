'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { ENTITIES, entityInfo, type Entity } from '@/lib/entity'
import { setCurrentEntity } from '@/server/actions/entity'
import { cn } from '@/lib/utils'

/** 사이드바 맨 위 법인 선택 (2026-10-08 요청) — 고르면 그 법인의 데이터만 보인다 */
export function EntitySwitcher({ entity }: { entity: Entity }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const info = entityInfo(entity)
  return (
    <label
      data-slot="entity-switcher"
      data-entity={entity}
      className={cn(
        'relative mb-3 flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium',
        entity === 'kr' ? 'border-sidebar-border bg-sidebar-accent/40' : 'border-amber-400 bg-amber-100 text-amber-950',
        pending && 'opacity-60',
      )}
      title="보는 법인을 바꿉니다. 거래·거래처·판관비·리포트가 모두 그 법인 것으로 바뀝니다"
    >
      <Building2 className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="truncate">{info.label}</span>
      <ChevronDown className="ml-auto size-3.5 shrink-0" />
      <select
        aria-label="법인 선택"
        value={entity}
        disabled={pending}
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => {
          const next = e.target.value as Entity
          if (next === entity) return
          start(async () => {
            const res = await setCurrentEntity(next)
            if ('error' in res) {
              toast.error(res.error)
              return
            }
            toast.success(`${entityInfo(next).label} 데이터를 봅니다`)
            router.refresh()
          })
        }}
      >
        {ENTITIES.map((e) => (
          <option key={e.code} value={e.code}>
            {e.label}
          </option>
        ))}
      </select>
    </label>
  )
}
