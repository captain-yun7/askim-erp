'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MediaOption, MediaOptionKind } from '@/lib/db/schema/media'
import { OPTION_KIND_LABEL } from '@/lib/media'
import { addMediaOption, deleteMediaOption, renameMediaOption } from '@/server/actions/media'

const FLAT_KINDS: MediaOptionKind[] = ['category', 'contract_type', 'vendor', 'status']

export function MediaOptionsEditor({ options }: { options: MediaOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: true } | { error: string }>, done?: () => void) =>
    start(async () => {
      const res = await fn()
      if ('error' in res) toast.error(res.error)
      else {
        done?.()
        router.refresh()
      }
    })
  const of = (kind: MediaOptionKind, parentId: number | null = null) => options.filter((o) => o.kind === kind && (kind !== 'region' || o.parentId === parentId))

  return (
    <div className="grid gap-4 px-8 py-6 lg:grid-cols-2">
      {FLAT_KINDS.map((kind) => (
        <section key={kind} className="rounded-2xl border bg-card p-4" data-option-kind={kind}>
          <h2 className="mb-3 text-[15px] font-semibold">{OPTION_KIND_LABEL[kind]}</h2>
          <OptionList items={of(kind)} pending={pending} run={run} />
          <AddRow placeholder={`${OPTION_KIND_LABEL[kind]} 추가`} pending={pending} onAdd={(value, done) => run(() => addMediaOption({ kind, value, parentId: null }), done)} />
        </section>
      ))}
      <section className="rounded-2xl border bg-card p-4 lg:col-span-2" data-option-kind="region">
        <h2 className="mb-1 text-[15px] font-semibold">지역</h2>
        <p className="mb-3 text-[12px] text-muted-foreground">시 → 구 → 동네 세 단계. 이름을 바꾸면 그 지역을 쓰는 매체도 같이 바뀝니다.</p>
        <div className="space-y-3">
          {of('region').map((city) => (
            <div key={city.id} className="rounded-xl border p-3">
              <OptionList items={[city]} pending={pending} run={run} strong />
              <div className="ml-5 mt-2 space-y-2 border-l pl-3">
                {of('region', city.id).map((d) => (
                  <div key={d.id}>
                    <OptionList items={[d]} pending={pending} run={run} />
                    <div className="ml-5 border-l pl-3">
                      <OptionList items={of('region', d.id)} pending={pending} run={run} />
                      <AddRow placeholder={`${d.value} 아래 동네 추가`} pending={pending} onAdd={(value, done) => run(() => addMediaOption({ kind: 'region', value, parentId: d.id }), done)} />
                    </div>
                  </div>
                ))}
                <AddRow placeholder={`${city.value} 아래 구 추가`} pending={pending} onAdd={(value, done) => run(() => addMediaOption({ kind: 'region', value, parentId: city.id }), done)} />
              </div>
            </div>
          ))}
          <AddRow placeholder="시 추가 (예: 서울, 부산)" pending={pending} onAdd={(value, done) => run(() => addMediaOption({ kind: 'region', value, parentId: null }), done)} />
        </div>
      </section>
    </div>
  )
}

function OptionList({
  items,
  pending,
  run,
  strong,
}: {
  items: MediaOption[]
  pending: boolean
  run: (fn: () => Promise<{ ok: true } | { error: string }>) => void
  strong?: boolean
}) {
  return (
    <ul className="space-y-1">
      {items.map((o) => (
        <li key={o.id} className="flex items-center gap-1.5" data-option={o.value}>
          <Input
            aria-label={`${o.value} 이름`}
            defaultValue={o.value}
            className={'h-8 ' + (strong ? 'font-semibold' : '')}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== o.value) run(() => renameMediaOption(o.id, v))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={`${o.value} 삭제`}
            disabled={pending}
            onClick={() => {
              if (confirm(`'${o.value}' 를 목록에서 지울까요?\n이미 이 값을 쓰는 매체는 그대로 남습니다.`)) run(() => deleteMediaOption(o.id))
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  )
}

function AddRow({ placeholder, pending, onAdd }: { placeholder: string; pending: boolean; onAdd: (value: string, done: () => void) => void }) {
  const [v, setV] = useState('')
  const add = () => v.trim() && onAdd(v.trim(), () => setV(''))
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Input aria-label={placeholder} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-8" onKeyDown={(e) => e.key === 'Enter' && add()} />
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1" disabled={pending || !v.trim()} onClick={add}>
        <Plus className="size-3.5" />추가
      </Button>
    </div>
  )
}
