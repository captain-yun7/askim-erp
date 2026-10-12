'use client'

import { currentFilterParams, pushFilterParams } from '@/lib/filter-nav'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ChevronDown, Download, Search } from 'lucide-react'
import { DEAL_SORT_LABEL, type DealSort } from '@/lib/deal-sort'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Cat = { id: number; nameKo: string }
type User = { id: string; name: string }

const yearTab =
  'h-7 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'

const chip =
  'h-9 gap-1.5 rounded-full border bg-background px-3.5 text-[13px] font-medium data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:[&_span]:text-primary-foreground/70'

export function DealsFilters({
  categories,
  users,
  yearOptions,
  allYears = false,
  initial,
}: {
  categories: Cat[]
  users: User[]
  /** 거래가 있는 귀속연도 (최근 순) — 연도 탭 */
  yearOptions?: number[]
  /** year=all 로 전체 연도를 보는 중 */
  allYears?: boolean
  initial: {
    q?: string
    years?: number[]
    months?: number[]
    categoryIds?: number[]
    ownerUserIds?: string[]
    paid?: string[]
    changedOnly?: boolean
    review?: string[]
    sort?: DealSort
    dir?: 'asc' | 'desc'
  }
}) {
  const router = useRouter()

  function update(patch: Record<string, string | undefined>, opts?: { keepAll?: boolean }) {
    const next = currentFilterParams('/deals')
    for (const [k, v] of Object.entries(patch)) {
      // year=all 은 "전체 연도"라는 실제 값이라 지우지 않는다 (기본은 올해)
      if (v === undefined || v === '' || (v === 'all' && !opts?.keepAll)) next.delete(k)
      else next.set(k, v)
    }
    next.delete('page')
    pushFilterParams(router, '/deals', next)
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
        <Input
          key={initial.q ?? ''}
          defaultValue={initial.q ?? ''}
          placeholder="거래코드, 거래처, 품목 검색..."
          className="h-9 pl-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              update({ q: (e.target as HTMLInputElement).value })
          }}
        />
      </div>

      {/* 귀속연도 탭 (2026-10-12 긴급 요청): 기본 올해, 눌러서 연도 바꾸기, 전체 */}
      <div data-slot="year-tabs" className="flex items-center gap-1 rounded-full border bg-background p-1">
        {[...new Set([new Date().getFullYear(), ...(yearOptions ?? [])])].sort((a, b) => b - a).map((y) => {
          const active = !allYears && initial.years?.length === 1 && initial.years[0] === y
          return (
            <button key={y} type="button" data-active={active} className={yearTab} onClick={() => update({ year: String(y) })}>
              {y}
            </button>
          )
        })}
        <button type="button" data-active={allYears} className={yearTab} onClick={() => update({ year: 'all' }, { keepAll: true })}>
          전체
        </button>
      </div>
      <MultiSelect
        label="귀속연도"
        options={[...new Set([2023, 2024, 2025, 2026, 2027, ...(yearOptions ?? [])])].sort().map((y) => ({ value: String(y), label: String(y) }))}
        selected={(initial.years ?? []).map(String)}
        onChange={(v) => update({ year: v.length ? v.join(',') : 'all' }, { keepAll: true })}
        width="w-40"
      />

      <MultiSelect
        label="월"
        options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` }))}
        selected={(initial.months ?? []).map(String)}
        onChange={(v) => update({ month: v.length ? v.join(',') : undefined })}
      />
      <MultiSelect
        label="상품구분"
        options={categories.map((c) => ({ value: String(c.id), label: c.nameKo }))}
        selected={(initial.categoryIds ?? []).map(String)}
        onChange={(v) => update({ categoryId: v.length ? v.join(',') : undefined })}
      />

      <MultiSelect
        label="담당자"
        options={users.map((u) => ({ value: u.id, label: u.name }))}
        selected={initial.ownerUserIds ?? []}
        onChange={(ids) => update({ owner: ids.length ? ids.join(',') : undefined })}
        width="w-56"
      />

      <MultiSelect
        label="상태"
        options={[
          { value: 'unpaid', label: '미입금' },
          { value: 'unsettled', label: '미결산' },
        ]}
        selected={initial.paid ?? []}
        onChange={(v) => update({ paid: v.length ? v.join(',') : undefined })}
        summaryUnit=""
      />

      {/* 수정 모아보기 (2026-10-08 요청): 최근 수정 음영이 하나라도 있는 거래만 */}
      <button
        type="button"
        data-active={Boolean(initial.changedOnly)}
        aria-pressed={Boolean(initial.changedOnly)}
        className={chip}
        title="최근 수정 표시 기간 안에 바뀐 칸이 있는 거래만 봅니다"
        onClick={() => update({ changed: initial.changedOnly ? undefined : '1' })}
      >
        수정 모아보기
      </button>
      <MultiSelect
        label="수정 표시"
        options={[
          { value: 'requested', label: '수정요청' },
          { value: 'done', label: '수정완료' },
        ]}
        selected={initial.review ?? []}
        onChange={(v) => update({ review: v.length ? v.join(',') : undefined })}
        summaryUnit=""
      />

      {/* 정렬 (2026-09-15): 기본 작성순, 기준·방향 선택 */}
      <Select
        key={initial.sort ?? 'created'}
        defaultValue={initial.sort ?? 'created'}
        onValueChange={(v) => update({ sort: v === 'created' ? undefined : (v ?? undefined) })}
      >
        <SelectTrigger className={chip} data-active={Boolean(initial.sort && initial.sort !== 'created')} aria-label="정렬 기준">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(DEAL_SORT_LABEL) as DealSort[]).map((k) => (
            <SelectItem key={k} value={k}>
              {DEAL_SORT_LABEL[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        aria-label={initial.dir === 'asc' ? '오름차순 (클릭하면 내림차순)' : '내림차순 (클릭하면 오름차순)'}
        title={initial.dir === 'asc' ? '오름차순' : '내림차순'}
        className="grid size-9 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-muted"
        onClick={() => update({ dir: initial.dir === 'asc' ? undefined : 'asc' })}
      >
        {initial.dir === 'asc' ? <ArrowUpNarrowWide className="size-4" /> : <ArrowDownWideNarrow className="size-4" />}
      </button>

      <button
        type="button"
        title="내보내기"
        className="ml-auto grid size-9 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-muted"
      >
        <Download className="size-4" />
      </button>
    </div>
  )
}

/** 다중 선택 칩 — 체크박스 인라인 드롭다운, URL 은 key=a,b (2026-09-09 피드백: 월·상품구분·상태도 다중) */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  width = 'w-48',
  summaryUnit = '개',
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  width?: string
  summaryUnit?: string
}) {
  // 연속 클릭 시 URL 반영 전 stale prop 으로 덮어쓰지 않도록 로컬 상태 유지, prop 바뀌면 동기화
  const propKey = selected.join(',')
  const [syncedKey, setSyncedKey] = useState(propKey)
  const [local, setLocal] = useState(selected)
  if (syncedKey !== propKey) {
    setSyncedKey(propKey)
    setLocal(selected)
  }

  const names = options.filter((o) => local.includes(o.value)).map((o) => o.label)
  const summary =
    names.length === 0 ? '전체' : names.length <= 2 ? names.join(', ') : `${names[0]} 외 ${names.length - 1}${summaryUnit}`

  function apply(values: string[]) {
    setLocal(values)
    onChange(values)
  }
  function toggle(v: string) {
    apply(local.includes(v) ? local.filter((x) => x !== v) : [...local, v])
  }

  // 포털 팝오버는 body zoom(화면 크기 설정)과 위치가 어긋나서 인라인 드롭다운 사용
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={cn(chip, 'inline-flex items-center')}
        data-active={local.length > 0}
        aria-expanded={open}
        aria-label={`${label} 필터`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="max-w-40 truncate">{summary}</span>
        <span className="text-muted-foreground">{label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className={cn('absolute left-0 top-full z-50 mt-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10', width)}>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px] hover:bg-accent"
            onClick={() => apply([])}
          >
            전체
            {local.length === 0 && <Check className="size-3.5 text-primary" />}
          </button>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-72 overflow-y-auto">
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-accent"
              >
                <Checkbox checked={local.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
