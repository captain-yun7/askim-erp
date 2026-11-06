'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { listHref } from '@/lib/list-return'
import { MEDIA_PRICE_TYPES, type MediaOption, type MediaPriceType } from '@/lib/db/schema/media'
import { MEDIA_STATUSES, PRICE_TYPE_LABEL, contractExpired } from '@/lib/media'
import { deleteMedia, saveMedia } from '@/server/actions/media'
import type { MediaRow } from '@/server/queries/media'

const selectCls = 'h-9 w-full rounded-full border border-input bg-background px-3.5 text-sm disabled:opacity-60'

type PriceDraft = { key: number; type: MediaPriceType; label: string; amountMan: string; approx: boolean; note: string }
type ContactDraft = { key: number; name: string; title: string; company: string; phone: string; phone2: string }
type VendorDraft = { key: number; name: string; note: string }

let seq = 0
const k = () => ++seq

const manText = (won: string | null) => {
  if (won == null) return ''
  const n = Number(won) / 10_000
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10_000) / 10_000)
}

/** 목록에 없는 기존 값도 보이게 앞에 붙인다 */
function withCurrent(values: string[], current: string | null | undefined) {
  return current && !values.includes(current) ? [current, ...values] : values
}

export function MediaForm({
  initial,
  options,
  users,
  readOnly = false,
}: {
  initial: MediaRow | null
  options: MediaOption[]
  users: { id: string; name: string }[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [f, setF] = useState({
    category: initial?.category ?? '',
    regionCity: initial?.regionCity ?? '',
    regionDistrict: initial?.regionDistrict ?? '',
    regionArea: initial?.regionArea ?? '',
    name: initial?.name ?? '',
    contractType: initial?.contractType ?? '',
    contractStart: initial?.contractStart ?? null,
    contractEnd: initial?.contractEnd ?? null,
    contractNote: initial?.contractNote ?? '',
    staffNote: initial?.staffNote ?? '',
    runPeriod: initial?.runPeriod ?? '',
    status: initial?.status ?? '운영 중',
    memo: initial?.memo ?? '',
  })
  const [prices, setPrices] = useState<PriceDraft[]>(
    (initial?.prices ?? []).map((p) => ({ key: k(), type: p.type, label: p.label ?? '', amountMan: manText(p.amount), approx: p.approx, note: p.note ?? '' })),
  )
  const [contacts, setContacts] = useState<ContactDraft[]>(
    (initial?.contacts ?? []).map((c) => ({ key: k(), name: c.name ?? '', title: c.title ?? '', company: c.company ?? '', phone: c.phone ?? '', phone2: c.phone2 ?? '' })),
  )
  const [staffIds, setStaffIds] = useState<string[]>((initial?.staff ?? []).map((s) => s.id))
  const [vendors, setVendors] = useState<VendorDraft[]>((initial?.vendors ?? []).map((v) => ({ key: k(), name: v.name, note: v.note ?? '' })))
  const [showSource, setShowSource] = useState(false)

  const set = <K extends keyof typeof f>(key: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [key]: v }))
  const opts = (kind: MediaOption['kind'], parentId: number | null = null) =>
    options.filter((o) => o.kind === kind && (kind !== 'region' || o.parentId === parentId))
  const cityOpt = opts('region').find((o) => o.value === f.regionCity)
  const districtOpt = cityOpt ? opts('region', cityOpt.id).find((o) => o.value === f.regionDistrict) : undefined
  const statusValues = opts('status').map((o) => o.value)

  function submit() {
    startTransition(async () => {
      const res = await saveMedia(initial?.id ?? null, {
        ...f,
        prices: prices.map(({ type, label, amountMan, approx, note }) => ({ type, label, amountMan, approx, note })),
        contacts: contacts.map(({ name, title, company, phone, phone2 }) => ({ name, title, company, phone, phone2 })),
        staffIds,
        vendors: vendors.filter((v) => v.name).map(({ name, note }) => ({ name, note })),
      })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('저장되었습니다')
      router.push(listHref('/media'))
    })
  }

  function remove() {
    if (!initial || !confirm(`'${initial.name}' 매체를 삭제할까요?`)) return
    startTransition(async () => {
      const res = await deleteMedia(initial.id)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('매체를 삭제했습니다')
      router.push(listHref('/media'))
    })
  }

  const expired = contractExpired(f.contractEnd)

  return (
    <div className="space-y-4 px-8 py-6">
      {readOnly && <p className="text-[12.5px] text-muted-foreground">조회 전용 — 수정 권한이 없습니다</p>}
      <fieldset disabled={readOnly} className="contents">
        <Card>
          <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
            <Section title="기본 정보" />
            <Field label="매체번호">
              <Input value={initial?.code ?? '저장하면 자동으로 붙습니다'} disabled />
            </Field>
            <Field label="매체명 *" className="md:col-span-2">
              <Input aria-label="매체명" value={f.name} onChange={(e) => set('name', e.target.value)} />
              {initial?.nameOriginal && <p className="text-[11.5px] text-muted-foreground">엑셀 원래 이름: {initial.nameOriginal}</p>}
            </Field>
            <Field label="구분">
              <select aria-label="구분" className={selectCls} value={f.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">선택</option>
                {withCurrent(opts('category').map((o) => o.value), f.category).map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="관리 상태">
              <select aria-label="관리 상태" className={selectCls} value={f.status} onChange={(e) => set('status', e.target.value)}>
                {withCurrent(statusValues.length ? statusValues : MEDIA_STATUSES, f.status).map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="집행기간">
              <Input aria-label="집행기간" value={f.runPeriod} onChange={(e) => set('runPeriod', e.target.value)} placeholder="2주" />
            </Field>
            <Field label="지역 (시 → 구 → 동네)" className="md:col-span-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <select aria-label="시" className={selectCls} value={f.regionCity} onChange={(e) => setF((p) => ({ ...p, regionCity: e.target.value, regionDistrict: '', regionArea: '' }))}>
                  <option value="">시 선택</option>
                  {withCurrent(opts('region').map((o) => o.value), f.regionCity).map((v) => <option key={v}>{v}</option>)}
                </select>
                <select aria-label="구" className={selectCls} value={f.regionDistrict} onChange={(e) => setF((p) => ({ ...p, regionDistrict: e.target.value, regionArea: '' }))}>
                  <option value="">구 선택</option>
                  {withCurrent(cityOpt ? opts('region', cityOpt.id).map((o) => o.value) : [], f.regionDistrict).map((v) => <option key={v}>{v}</option>)}
                </select>
                <select aria-label="동네" className={selectCls} value={f.regionArea} onChange={(e) => set('regionArea', e.target.value)}>
                  <option value="">동네 선택</option>
                  {withCurrent(districtOpt ? opts('region', districtOpt.id).map((o) => o.value) : [], f.regionArea).map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>
            </Field>

            <Section title="계약" />
            <Field label="계약종류">
              <select aria-label="계약종류" className={selectCls} value={f.contractType} onChange={(e) => set('contractType', e.target.value)}>
                <option value="">없음</option>
                {withCurrent(opts('contract_type').map((o) => o.value), f.contractType).map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="시작일">
              <DateInput aria-label="계약 시작일" value={f.contractStart} onChange={(v) => set('contractStart', v)} disabled={readOnly} />
            </Field>
            <Field label="끝나는 날">
              <DateInput aria-label="계약 끝나는 날" value={f.contractEnd} onChange={(v) => set('contractEnd', v)} disabled={readOnly} />
              {expired && <p className="text-[11.5px] font-medium text-destructive" data-slot="media-expired">끝나는 날이 지나 만료된 계약입니다</p>}
            </Field>
            <Field label="계약 메모 (엑셀 원문)" className="md:col-span-3">
              <Input aria-label="계약 메모" value={f.contractNote} onChange={(e) => set('contractNote', e.target.value)} placeholder="예: 26.08.01~28.07.31(2년)" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">가격</h2>
              <span className="text-[12px] text-muted-foreground">만원 단위 · 부가세 별도 · 면·기간마다 한 줄</span>
            </div>
            {MEDIA_PRICE_TYPES.map((type) => {
              const lines = prices.filter((p) => p.type === type)
              const patch = (key: number, v: Partial<PriceDraft>) => setPrices((ps) => ps.map((p) => (p.key === key ? { ...p, ...v } : p)))
              return (
                <div key={type} data-price-type={type} className="rounded-xl border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-medium">{PRICE_TYPE_LABEL[type]}</span>
                    {!readOnly && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => setPrices((ps) => [...ps, { key: k(), type, label: '', amountMan: '', approx: false, note: '' }])}>
                        <Plus className="size-3.5" />줄 추가
                      </Button>
                    )}
                  </div>
                  {lines.length === 0 && <p className="text-[12px] text-muted-foreground">없음</p>}
                  <div className="space-y-1.5">
                    {lines.map((p) => (
                      <div key={p.key} className="grid grid-cols-[1fr_8rem_auto_1fr_auto] items-center gap-2" data-slot="price-line">
                        <Input aria-label="면·기간" value={p.label} onChange={(e) => patch(p.key, { label: e.target.value })} placeholder="면·기간 (예: 정면, 2주)" className="h-8" />
                        <Input aria-label="금액(만원)" inputMode="decimal" value={p.amountMan} onChange={(e) => patch(p.key, { amountMan: e.target.value })} placeholder="금액" className="h-8 text-right font-mono" />
                        <label className="flex items-center gap-1 whitespace-nowrap text-[12px]">
                          <input type="checkbox" checked={p.approx} onChange={(e) => patch(p.key, { approx: e.target.checked })} />
                          전후
                        </label>
                        <Input aria-label="가격 메모" value={p.note} onChange={(e) => patch(p.key, { note: e.target.value })} placeholder="메모" className="h-8" />
                        {!readOnly && (
                          <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="가격 줄 삭제" onClick={() => setPrices((ps) => ps.filter((x) => x.key !== p.key))}>
                            <X className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">매체 담당자 <span className="text-[12px] font-normal text-muted-foreground">사람마다 한 줄</span></h2>
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => setContacts((cs) => [...cs, { key: k(), name: '', title: '', company: '', phone: '', phone2: '' }])}>
                  <Plus className="size-3.5" />담당자 추가
                </Button>
              )}
            </div>
            {contacts.length === 0 && <p className="text-[12px] text-muted-foreground">없음</p>}
            {contacts.map((c) => {
              const patch = (v: Partial<ContactDraft>) => setContacts((cs) => cs.map((x) => (x.key === c.key ? { ...x, ...v } : x)))
              return (
                <div key={c.key} className="grid grid-cols-2 items-center gap-2 md:grid-cols-[1fr_6rem_1fr_9rem_9rem_auto]" data-slot="contact-line">
                  <Input aria-label="이름" value={c.name} onChange={(e) => patch({ name: e.target.value })} placeholder="이름" className="h-8" />
                  <Input aria-label="직함" value={c.title} onChange={(e) => patch({ title: e.target.value })} placeholder="직함" className="h-8" />
                  <Input aria-label="회사" value={c.company} onChange={(e) => patch({ company: e.target.value })} placeholder="회사" className="h-8" />
                  <Input aria-label="연락처" value={c.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="010-0000-0000" className="h-8 font-mono" />
                  <Input aria-label="연락처2" value={c.phone2} onChange={(e) => patch({ phone2: e.target.value })} placeholder="두 번째 번호" className="h-8 font-mono" />
                  {!readOnly && (
                    <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="담당자 삭제" onClick={() => setContacts((cs) => cs.filter((x) => x.key !== c.key))}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
            <div className="space-y-2">
              <h2 className="text-[15px] font-semibold">사내 담당</h2>
              <div className="flex flex-wrap gap-1.5" data-slot="staff-picker">
                {users.map((u) => {
                  const on = staffIds.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setStaffIds((ids) => (on ? ids.filter((x) => x !== u.id) : [...ids, u.id]))}
                      className={on ? 'rounded-full bg-primary px-2.5 py-1 text-[12px] text-primary-foreground' : 'rounded-full border px-2.5 py-1 text-[12px] text-muted-foreground hover:text-foreground'}
                    >
                      {u.name}
                    </button>
                  )
                })}
              </div>
              <Input aria-label="직원 목록에 없는 담당" value={f.staffNote} onChange={(e) => set('staffNote', e.target.value)} placeholder="직원 목록에 없는 담당 (예: 영업팀)" className="h-8" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">시공사 <span className="text-[12px] font-normal text-muted-foreground">둘이면 두 줄</span></h2>
                {!readOnly && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => setVendors((vs) => [...vs, { key: k(), name: '', note: '' }])}>
                    <Plus className="size-3.5" />시공사 추가
                  </Button>
                )}
              </div>
              {vendors.length === 0 && <p className="text-[12px] text-muted-foreground">없음</p>}
              {vendors.map((v) => {
                const patch = (x: Partial<VendorDraft>) => setVendors((vs) => vs.map((y) => (y.key === v.key ? { ...y, ...x } : y)))
                return (
                  <div key={v.key} className="grid grid-cols-[1fr_1fr_auto] gap-2" data-slot="vendor-line">
                    <select aria-label="시공사" className={selectCls + ' h-8'} value={v.name} onChange={(e) => patch({ name: e.target.value })}>
                      <option value="">선택</option>
                      {withCurrent(opts('vendor').map((o) => o.value), v.name).map((x) => <option key={x}>{x}</option>)}
                    </select>
                    <Input aria-label="시공사 메모" value={v.note} onChange={(e) => patch({ note: e.target.value })} placeholder="메모 (예: 상단)" className="h-8" />
                    {!readOnly && (
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="시공사 삭제" onClick={() => setVendors((vs) => vs.filter((y) => y.key !== v.key))}>
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>비고</Label>
              <Textarea aria-label="비고" rows={3} value={f.memo} onChange={(e) => set('memo', e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      {initial?.source != null && (
        <div className="rounded-2xl border bg-card px-4 py-3 text-[12.5px]">
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowSource((v) => !v)}>
            {showSource ? '▾' : '▸'} 엑셀 원본 보기 (가져올 때 그대로)
          </button>
          {showSource && (
            <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1" data-slot="media-source">
              {Object.entries(initial.source as Record<string, unknown>).map(([key, v]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="whitespace-pre-wrap">{v == null || v === '' ? '-' : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          {initial && !readOnly && (
            <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={remove} disabled={pending}>
              <Trash2 className="size-3.5" />매체 삭제
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.push(listHref('/media'))}>
            {readOnly ? '목록으로' : '취소'}
          </Button>
          {!readOnly && (
            <Button disabled={pending || !f.name.trim()} onClick={submit}>
              {pending ? '저장 중...' : '저장'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title }: { title: string }) {
  return <h2 className="text-[15px] font-semibold md:col-span-3">{title}</h2>
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={'grid content-start gap-1.5 ' + (className ?? '')}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
