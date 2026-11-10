'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteMedia } from '@/server/actions/media'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { contractExpired, formatMan, regionText } from '@/lib/media'
import { cn } from '@/lib/utils'
import type { MediaRow } from '@/server/queries/media'

const select = 'h-9 rounded-full border border-input bg-background px-3 text-[13px]'
const STICKY_RIGHT = 'sticky right-0 w-[72px] bg-background px-2 shadow-[-6px_0_6px_-6px_rgb(0_0_0/0.12)]'
const ko = new Intl.Collator('ko', { numeric: true })

/** 목록 필터 — 주소(?q=..)에 남겨 상세에 다녀와도 그대로 (2026-09-29 필터 기억과 같은 방식) */
const KEYS = ['q', 'category', 'district', 'contract', 'staff', 'status', 'expired'] as const
type Key = (typeof KEYS)[number]

function haystack(m: MediaRow) {
  return [
    m.code,
    m.name,
    m.nameOriginal,
    regionText(m),
    m.category,
    m.contractType,
    m.memo,
    m.staffNote,
    ...m.staff.map((s) => s.name),
    ...m.vendors.map((v) => v.name),
    ...m.contacts.flatMap((c) => [c.name, c.title, c.company, c.phone, c.phone2]),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** 가격 칸 3개 — 매입가 · 입금가(Net) · 판매가(Gross) (2026-11-09 요청, 매입가가 가장 중요해서 굵게) */
const PRICE_COLS = [
  { type: 'landlord', label: '매입가', bold: true },
  { type: 'net', label: '입금가(Net)', bold: false },
  { type: 'sale', label: '판매가(Gross)', bold: false },
] as const

function PriceCell({ m, type, bold }: { m: MediaRow; type: (typeof PRICE_COLS)[number]['type']; bold: boolean }) {
  const lines = m.prices.filter((p) => p.type === type)
  const first = lines[0]
  return (
    <TableCell
      data-col={`price-${type}`}
      className="max-w-36 text-right text-[12.5px]"
      title={lines.map((p) => `${p.label ?? ''} ${p.amount == null ? (p.note ?? '-') : formatMan(p.amount)}`.trim()).join('\n') || undefined}
    >
      {first ? (
        <>
          {/* 면·기간은 금액 위 작은 줄로 — 칸 3개가 좁은 화면에도 들어가게 */}
          {first.label && <div className="text-[11px] leading-tight text-muted-foreground">{first.label}</div>}
          {first.amount == null ? (
            <span className="text-[11.5px] text-muted-foreground">{first.note ?? '-'}</span>
          ) : (
            <span className={cn('whitespace-nowrap font-mono tabular-nums', bold && 'font-bold text-foreground')}>{formatMan(first.amount)}</span>
          )}
          {first.approx && <span className="text-muted-foreground"> 전후</span>}
          {lines.length > 1 && <span className="ml-1 whitespace-nowrap text-[11px] text-muted-foreground">외 {lines.length - 1}</span>}
        </>
      ) : (
        <span className="text-muted-foreground">-</span>
      )}
    </TableCell>
  )
}

export function MediaBoard({ rows, editable = false }: { rows: MediaRow[]; editable?: boolean }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  // 줄 끝 수정·삭제 버튼 (2026-11-06 요청: 보증금 표처럼)
  const remove = (m: MediaRow) => {
    if (!confirm(`'${m.name}' 매체를 삭제할까요?`)) return
    startDelete(async () => {
      const res = await deleteMedia(m.id)
      if ('error' in res) toast.error(res.error)
      else {
        toast.success('매체를 삭제했습니다')
        router.refresh()
      }
    })
  }
  const sp = useSearchParams()
  const get = (k: Key) => sp.get(k) ?? ''
  const set = (k: Key, v: string) => {
    const next = new URLSearchParams(sp.toString())
    if (v) next.set(k, v)
    else next.delete(k)
    const qs = next.toString()
    window.history.replaceState(null, '', qs ? `/media?${qs}` : '/media')
  }

  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort(ko.compare)
  const categories = uniq(rows.map((r) => r.category))
  const districts = uniq(rows.map((r) => r.regionDistrict ?? r.regionCity))
  const contracts = uniq(rows.map((r) => r.contractType))
  const statuses = uniq(rows.map((r) => r.status))
  const staffNames = uniq(rows.flatMap((r) => [...r.staff.map((s) => s.name), ...(r.staffNote ? r.staffNote.split(/,\s*/) : [])]))

  // 검색어는 칠 때마다 바로 거른다 — 주소는 따라서 바꾼다
  const [query, setQuery] = useState(get('q'))
  const q = query.replace(/\s+/g, '').toLowerCase()
  const shown = rows.filter((m) => {
    if (q && !haystack(m).includes(q)) return false
    if (get('category') && m.category !== get('category')) return false
    if (get('district') && (m.regionDistrict ?? m.regionCity) !== get('district')) return false
    if (get('contract') && (get('contract') === '-' ? m.contractType : m.contractType !== get('contract'))) return false
    if (get('staff') && !m.staff.some((s) => s.name === get('staff')) && !(m.staffNote ?? '').split(/,\s*/).includes(get('staff'))) return false
    if (get('status') && m.status !== get('status')) return false
    if (get('expired') && !contractExpired(m.contractEnd)) return false
    return true
  })
  const filtered = !!query || KEYS.some((k) => k !== 'q' && get(k))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="매체명, 매체번호, 담당자, 연락처, 시공사 검색..."
            className="h-9 pl-9"
            onChange={(e) => {
              setQuery(e.target.value)
              set('q', e.target.value)
            }}
          />
        </div>
        <select aria-label="구분" className={select} value={get('category')} onChange={(e) => set('category', e.target.value)}>
          <option value="">구분 전체</option>
          {categories.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select aria-label="지역" className={select} value={get('district')} onChange={(e) => set('district', e.target.value)}>
          <option value="">지역 전체</option>
          {districts.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select aria-label="계약종류" className={select} value={get('contract')} onChange={(e) => set('contract', e.target.value)}>
          <option value="">계약종류 전체</option>
          {contracts.map((v) => <option key={v}>{v}</option>)}
          <option value="-">계약종류 없음</option>
        </select>
        <select aria-label="사내 담당" className={select} value={get('staff')} onChange={(e) => set('staff', e.target.value)}>
          <option value="">사내 담당 전체</option>
          {staffNames.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select aria-label="관리 상태" className={select} value={get('status')} onChange={(e) => set('status', e.target.value)}>
          <option value="">상태 전체</option>
          {statuses.map((v) => <option key={v}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[13px]">
          <input type="checkbox" checked={!!get('expired')} onChange={(e) => set('expired', e.target.checked ? '1' : '')} />
          계약 만료만
        </label>
      </div>

      <div className="flex items-center gap-3 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground" data-slot="media-count">
        {filtered ? '조건에 맞는' : '전체'} <b className="text-foreground">{shown.length}</b>건
        {filtered && (
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => {
              setQuery('')
              window.history.replaceState(null, '', '/media')
            }}>
            조건 지우기
          </button>
        )}
        <span className="ml-auto">가격은 만원, 부가세 별도</span>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">매체번호</TableHead>
              <TableHead>구분</TableHead>
              <TableHead>지역</TableHead>
              <TableHead>매체명</TableHead>
              <TableHead>계약</TableHead>
              {PRICE_COLS.map((c) => (
                <TableHead key={c.type} className={cn('text-right', c.bold && 'font-bold text-foreground')}>{c.label}</TableHead>
              ))}
              <TableHead>매체 담당자</TableHead>
              <TableHead>사내 담당</TableHead>
              <TableHead>시공사</TableHead>
              <TableHead>상태</TableHead>
              {/* 표가 화면보다 넓어도 버튼이 늘 보이게 오른쪽에 붙인다 */}
              {editable && <TableHead className={STICKY_RIGHT}><span className="sr-only">수정·삭제</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={editable ? 13 : 12} className="py-12 text-center text-sm text-muted-foreground">
                  {rows.length ? '조건에 맞는 매체가 없습니다' : '등록된 매체가 없습니다'}
                </TableCell>
              </TableRow>
            )}
            {shown.map((m) => {
              const expired = contractExpired(m.contractEnd)
              const contact = m.contacts[0]
              return (
                <TableRow key={m.id} data-media-code={m.code}>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">{m.code}</TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px]">{m.category ?? '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px]">{regionText(m) || '-'}</TableCell>
                  <TableCell className="min-w-40 max-w-64 whitespace-normal break-keep">
                    <Link href={`/media/${m.id}`} className="font-medium hover:underline">
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px]" data-col="contract">
                    {m.contractType ?? <span className="text-muted-foreground">-</span>}
                    {(m.contractStart || m.contractEnd) && (
                      <div className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                        {m.contractStart ?? ''} ~ {m.contractEnd ?? ''}
                      </div>
                    )}
                    {expired && <span className="ml-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">만료</span>}
                  </TableCell>
                  {PRICE_COLS.map((c) => <PriceCell key={c.type} m={m} type={c.type} bold={c.bold} />)}
                  <TableCell className="max-w-48 whitespace-normal break-keep text-[12.5px]">
                    {contact ? (
                      <>
                        {[contact.company, contact.name, contact.title].filter(Boolean).join(' ')}
                        {contact.phone && <div className="whitespace-nowrap font-mono text-[11.5px] tabular-nums text-muted-foreground">{contact.phone}</div>}
                        {m.contacts.length > 1 && <span className="text-[11px] text-muted-foreground">외 {m.contacts.length - 1}명</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-32 whitespace-normal break-keep text-[12.5px]">
                    {[...m.staff.map((s) => s.name), m.staffNote].filter(Boolean).join(', ') || '-'}
                  </TableCell>
                  <TableCell className="max-w-32 whitespace-normal break-keep text-[12.5px]">{m.vendors.map((v) => v.name).join(', ') || '-'}</TableCell>
                  <TableCell>
                    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', m.status === '운영 중' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground')}>
                      {m.status}
                    </span>
                  </TableCell>
                  {editable && (
                    <TableCell data-col="actions" className={STICKY_RIGHT}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-7" aria-label={`${m.name} 수정`} title="수정" onClick={() => router.push(`/media/${m.id}`)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`${m.name} 삭제`} title="삭제" disabled={deleting} onClick={() => remove(m)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
