'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatDate, formatKRW } from '@/lib/format'
import {
  deleteDeposit,
  deleteExclusiveContract,
  saveDeposit,
  saveExclusiveContract,
} from '@/server/actions/deposits'
import type { Deposit, ExclusiveContract } from '@/lib/db/schema'
import { AttachmentButton } from '@/components/attachments/attachment-button'

// 보증금 상태는 보유·반환완료 둘만 (2026-10-28 요청: 미반환·상계예정은 보유로 합침)
const STATUS_LABEL: Record<string, string> = {
  held: '보유',
  returned: '반환완료',
}
const STATUS_TONE: Record<string, string> = {
  held: 'bg-accent text-accent-foreground',
  returned: 'bg-primary/10 text-primary',
}

function useSave() {
  const [pending, start] = useTransition()
  function run(fn: () => Promise<{ ok?: true; error?: string }>, done?: () => void) {
    start(async () => {
      const res = await fn()
      if (res.error) toast.error(res.error)
      else {
        toast.success('저장되었습니다')
        done?.()
      }
    })
  }
  return { pending, run }
}

// ── 한 표로 (2026-10-23 요청: 보증금·전속계약·보유자산을 나누지 말고 합쳐서) ──
type ContractKind = 'exclusive' | 'asset'
const KIND_LABEL = { deposit: '보증금', exclusive: '전속계약', asset: '보유자산' } as const

/** 계약·자산 상태 — 같은 값을 계약은 계약중/계약종료, 자산은 보유/처분으로 부른다 */
const CONTRACT_STATUS_LABEL: Record<ContractKind, Record<ExclusiveContract['status'], string>> = {
  exclusive: { active: '계약중', ended: '계약종료' },
  asset: { active: '보유', ended: '처분' },
}

/** 상태 칸 필터 — 보유·계약중·반환완료·계약종료 (2026-10-28 요청) */
const STATUS_FILTERS = ['held', 'active', 'returned', 'ended'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]
const FILTER_LABEL: Record<StatusFilter, string> = { held: '보유', active: '계약중', returned: '반환완료', ended: '계약종료' }
/** 처음엔 지금 가지고 있는 것만 — 반환완료·계약종료를 뺀다 */
const DEFAULT_FILTER: StatusFilter[] = ['held', 'active']

/** 구분 칸 필터 (2026-10-27 요청) — 고른 구분에 해당하는 상태만 상태 메뉴에 보인다. 보유자산은 2026-10-28 요청으로 뺌 */
const KINDS = ['deposit', 'exclusive'] as const
type Kind = (typeof KINDS)[number]
const STATUSES_OF: Record<Kind, StatusFilter[]> = {
  deposit: ['held', 'returned'],
  exclusive: ['active', 'ended'],
}

type Item =
  | { kind: 'deposit'; status: StatusFilter; row: Deposit }
  | { kind: 'exclusive'; status: StatusFilter; row: ExclusiveContract }

/** 순서 (2026-10-29 요청) — 전속계약 먼저, 그 다음 보증금. 각각 거래처 가나다순, 제목을 누르면 역순 */
type NameSort = 'asc' | 'desc'
const KIND_ORDER: Record<Item['kind'], number> = { exclusive: 0, deposit: 1 }
const nameCollator = new Intl.Collator('ko', { numeric: true })
const nameOf = (it: Item) => (it.kind === 'deposit' ? it.row.counterpartyName : it.row.mediaName) ?? ''

export function DepositBoard({
  deposits,
  contracts,
  editable,
  depositAttachments = {},
  contractAttachments = {},
}: {
  deposits: Deposit[]
  contracts: ExclusiveContract[]
  editable: boolean
  depositAttachments?: Record<string, number>
  contractAttachments?: Record<string, number>
}) {
  const { pending, run } = useSave()
  const [depositEditing, setDepositEditing] = useState<DepositEditing>(null)
  const [contractEditing, setContractEditing] = useState<ContractEditing>(null)
  const [statuses, setStatuses] = useState<StatusFilter[]>(DEFAULT_FILTER)
  const [kinds, setKinds] = useState<Kind[]>([...KINDS])
  const [nameSort, setNameSort] = useState<NameSort>('asc')
  // 하이드레이션이 끝나 제목 메뉴·정렬을 누를 수 있게 됐다는 표시 (e2e 가 기다린다)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  const items: Item[] = [
    ...deposits.map((row) => ({ kind: 'deposit' as const, status: row.status as StatusFilter, row })),
    ...contracts.filter((c) => c.kind === 'exclusive').map((row) => ({ kind: 'exclusive' as const, status: row.status, row })),
  ]
  const inKinds = items.filter((it) => kinds.includes(it.kind))
  const filtered = inKinds.filter((it) => statuses.includes(it.status))
  const shown = [...filtered].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || nameCollator.compare(nameOf(a), nameOf(b)) * (nameSort === 'asc' ? 1 : -1),
  )
  const statusOptions = STATUS_FILTERS.filter((s) => kinds.some((k) => STATUSES_OF[k].includes(s)))
  const picked = statusOptions.filter((s) => statuses.includes(s))
  const countOf = (s: StatusFilter) => inKinds.filter((it) => it.status === s).length
  const kindCount = (k: Kind) => items.filter((it) => it.kind === k && statuses.includes(it.status)).length
  const isDefault = statusOptions.every((s) => statuses.includes(s) === DEFAULT_FILTER.includes(s))
  const isAll = picked.length === statusOptions.length
  const allKinds = kinds.length === KINDS.length
  const toggle = (s: StatusFilter, on: boolean) =>
    setStatuses((p) => (on ? STATUS_FILTERS.filter((x) => x === s || p.includes(x)) : p.filter((x) => x !== s)))
  const toggleKind = (k: Kind, on: boolean) =>
    setKinds((p) => (on ? KINDS.filter((x) => x === k || p.includes(x)) : p.filter((x) => x !== k)))
  const statusNote = isAll ? '' : isDefault ? '지금 보유·계약중' : picked.map((s) => FILTER_LABEL[s]).join(' · ') || '선택한 상태 없음'

  return (
    <div data-deposit-ready={ready || undefined}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <span className="text-[12.5px] text-muted-foreground" data-slot="deposit-filter-note">
          {[allKinds ? '' : kinds.map((k) => KIND_LABEL[k]).join(' · ') || '선택한 구분 없음', statusNote].filter(Boolean).join(' / ') || '전체'}
          {' '}· <b className="text-foreground">{shown.length}</b>건
          <span className="ml-1.5">(표 제목의 구분·상태를 누르면 골라 볼 수 있습니다)</span>
        </span>
        {editable && (
          <div className="flex gap-1.5">
            <Button size="sm" className="gap-1" onClick={() => setDepositEditing({ id: null, draft: emptyDeposit })}>
              <Plus className="size-3.5" />
              보증금 추가
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setContractEditing({ id: null, kind: 'exclusive', draft: emptyContract })}>
              <Plus className="size-3.5" />
              전속계약 추가
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">No.</TableHead>
              <TableHead>
                <HeaderFilter label="구분" active={!allKinds} slot="deposit-kind-filter">
                  {KINDS.map((k) => (
                    <DropdownMenuCheckboxItem key={k} checked={kinds.includes(k)} onCheckedChange={(on) => toggleKind(k, on)}>
                      {KIND_LABEL[k]}
                      <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{kindCount(k)}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setKinds([...KINDS])}>전체 보기</DropdownMenuItem>
                </HeaderFilter>
              </TableHead>
              <TableHead aria-sort={nameSort === 'asc' ? 'ascending' : 'descending'}>
                <button
                  type="button"
                  data-slot="deposit-name-sort"
                  title={nameSort === 'asc' ? '가나다순 — 눌러서 역순' : '역순 — 눌러서 가나다순'}
                  className="-mx-1 inline-flex items-center gap-0.5 rounded px-1 text-foreground hover:bg-accent/60"
                  onClick={() => setNameSort((p) => (p === 'asc' ? 'desc' : 'asc'))}
                >
                  거래처(매체명)
                  {nameSort === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                </button>
              </TableHead>
              <TableHead>내용</TableHead>
              <TableHead>담당자</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>입금일</TableHead>
              <TableHead>반환일</TableHead>
              <TableHead>
                <HeaderFilter label="상태" active={!isAll} slot="deposit-status-filter">
                  {statusOptions.map((s) => (
                    <DropdownMenuCheckboxItem key={s} checked={statuses.includes(s)} onCheckedChange={(on) => toggle(s, on)}>
                      {FILTER_LABEL[s]}
                      <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{countOf(s)}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setStatuses([...STATUS_FILTERS])}>전체 보기</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatuses(DEFAULT_FILTER)}>지금 보유·계약중만 보기</DropdownMenuItem>
                </HeaderFilter>
              </TableHead>
              <TableHead>비고</TableHead>
              <TableHead className="w-12">첨부</TableHead>
              {editable && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={editable ? 12 : 11} className="py-12 text-center text-sm text-muted-foreground">
                  {items.length ? '고른 상태에 해당하는 건이 없습니다' : '등록된 보증금·계약이 없습니다'}
                </TableCell>
              </TableRow>
            )}
            {shown.map((it, i) =>
              it.kind === 'deposit' ? (
                <TableRow key={`d${it.row.id}`} data-kind="deposit">
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell><KindBadge kind="deposit" /></TableCell>
                  <TableCell className="min-w-24 max-w-40 whitespace-normal break-keep font-medium">{it.row.counterpartyName}</TableCell>
                  <TableCell className="max-w-48 truncate text-[12.5px]" title={it.row.description ?? undefined}>{it.row.description ?? '-'}</TableCell>
                  <TableCell className="max-w-20 whitespace-normal break-keep text-[12.5px]">{it.row.ownerName ?? '-'}</TableCell>
                  <TableCell className="text-right font-mono text-[12.5px] tabular-nums">{formatKRW(it.row.amount)}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{formatDate(it.row.paidDate)}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{formatDate(it.row.returnedDate)}</TableCell>
                  <TableCell data-col="status">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_TONE[it.row.status])}>
                      {STATUS_LABEL[it.row.status]}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-xs text-muted-foreground" title={it.row.memo ?? ''}>
                    {it.row.memo ?? ''}
                  </TableCell>
                  <TableCell>
                    <AttachmentButton targetType="deposit" targetId={String(it.row.id)} title={`${it.row.counterpartyName} · ${it.row.description ?? '보증금'}`} count={depositAttachments[String(it.row.id)] ?? 0} canEdit={editable} />
                  </TableCell>
                  {editable && (
                    <RowActions
                      pending={pending}
                      onEdit={() => setDepositEditing(depositDraftOf(it.row))}
                      onDelete={() => {
                        if (confirm(`'${it.row.counterpartyName}' 보증금을 삭제할까요?`)) run(() => deleteDeposit(it.row.id))
                      }}
                    />
                  )}
                </TableRow>
              ) : (
                <TableRow key={`c${it.row.id}`} data-kind={it.kind}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell><KindBadge kind={it.kind} /></TableCell>
                  <TableCell className="min-w-24 max-w-40 whitespace-normal break-keep font-medium">{it.row.mediaName}</TableCell>
                  <TableCell className="min-w-48 max-w-64 whitespace-normal break-keep text-[12.5px]">
                    <div className="line-clamp-2" title={it.row.contractTerms ?? undefined}>{it.row.contractTerms || '-'}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">
                      {[it.row.mediaType, it.row.contractPeriod, it.row.hasMonthlyFee && `월 고정비 ${it.row.hasMonthlyFee}`].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-20 whitespace-normal break-keep text-[12.5px]">{it.row.ownerName ?? '-'}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground/60">-</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{formatDate(it.row.depositPaidDate)}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{formatDate(it.row.depositReturnedDate)}</TableCell>
                  <TableCell data-col="status">
                    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', it.row.status === 'active' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground')}>
                      {CONTRACT_STATUS_LABEL[it.kind][it.row.status]}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-xs text-muted-foreground" title={it.row.memo ?? ''}>
                    {it.row.memo ?? ''}
                  </TableCell>
                  <TableCell>
                    <AttachmentButton targetType="contract" targetId={String(it.row.id)} title={`${it.row.mediaName}${it.row.contractPeriod ? ` · ${it.row.contractPeriod}` : ''}`} count={contractAttachments[String(it.row.id)] ?? 0} canEdit={editable} />
                  </TableCell>
                  {editable && (
                    <RowActions
                      pending={pending}
                      onEdit={() => setContractEditing(contractDraftOf(it.row, it.kind))}
                      onDelete={() => {
                        if (confirm(`'${it.row.mediaName}' 계약을 삭제할까요?`)) run(() => deleteExclusiveContract(it.row.id))
                      }}
                    />
                  )}
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>

      {/* 저장한 상태가 지금 필터에 빠져 있으면 보이게 넣는다 (반환완료로 저장했는데 목록에서 사라지지 않게) */}
      <DepositDialog editing={depositEditing} setEditing={setDepositEditing} onSaved={(s) => {
          toggle(s as StatusFilter, true)
          toggleKind('deposit', true)
        }} />
      <ContractDialog editing={contractEditing} setEditing={setContractEditing} onSaved={(_kind, s) => {
          toggle(s, true)
          toggleKind('exclusive', true)
        }} />
    </div>
  )
}

/** 엑셀 필터처럼 표 제목을 눌러 골라 보기 */
function HeaderFilter({ label, active, slot, children }: { label: string; active: boolean; slot: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label} 골라 보기`}
        title={`눌러서 ${label} 골라 보기`}
        className={cn('-mx-1 inline-flex items-center gap-0.5 rounded px-1 hover:bg-accent/60', active && 'text-foreground')}
      >
        {label}
        <ChevronDown className="size-3.5" />
        {active && <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-48" data-slot={slot}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function KindBadge({ kind }: { kind: keyof typeof KIND_LABEL }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
        kind === 'deposit' ? 'bg-info text-info-foreground' : kind === 'exclusive' ? 'bg-muted text-foreground' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  )
}

function RowActions({ pending, onEdit, onDelete }: { pending: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <TableCell>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" className="size-7" aria-label="수정" title="수정" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="삭제" title="삭제" disabled={pending} onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </TableCell>
  )
}

// ── 보증금 입력 ──────────────────────────────────────────
type DepositDraft = {
  counterpartyName: string
  description: string
  ownerName: string
  amount: string
  paidDate: string
  returnedDate: string
  status: string
  memo: string
}
type DepositEditing = { id: number | null; draft: DepositDraft } | null

const emptyDeposit: DepositDraft = {
  counterpartyName: '',
  description: '',
  ownerName: '',
  amount: '',
  paidDate: '',
  returnedDate: '',
  status: 'held',
  memo: '',
}

const depositDraftOf = (r: Deposit): DepositEditing => ({
  id: r.id,
  draft: {
    counterpartyName: r.counterpartyName,
    description: r.description ?? '',
    ownerName: r.ownerName ?? '',
    amount: String(parseFloat(r.amount)),
    paidDate: r.paidDate ?? '',
    returnedDate: r.returnedDate ?? '',
    status: r.status,
    memo: r.memo ?? '',
  },
})

function DepositDialog({ editing, setEditing, onSaved }: { editing: DepositEditing; setEditing: React.Dispatch<React.SetStateAction<DepositEditing>>; onSaved: (status: string) => void }) {
  const { pending, run } = useSave()

  function submit() {
    if (!editing) return
    const d = editing.draft
    run(
      () =>
        saveDeposit(editing.id, {
          counterpartyName: d.counterpartyName,
          description: d.description,
          ownerName: d.ownerName,
          amount: Number(d.amount.replace(/,/g, '')) || 0,
          paidDate: d.paidDate || null,
          returnedDate: d.returnedDate || null,
          status: d.status,
          memo: d.memo,
        }),
      () => {
        onSaved(d.status)
        setEditing(null)
      },
    )
  }

  const set = (patch: Partial<DepositDraft>) =>
    setEditing((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p))

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing?.id != null ? '보증금 수정' : '보증금 추가'}</DialogTitle>
        </DialogHeader>
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="거래처명" required>
              <Input value={editing.draft.counterpartyName} onChange={(e) => set({ counterpartyName: e.target.value })} />
            </Field>
            <Field label="담당자">
              <Input value={editing.draft.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
            </Field>
            <Field label="내용" wide>
              <Input value={editing.draft.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label="금액" required>
              <Input
                className="text-right font-mono"
                inputMode="numeric"
                value={editing.draft.amount}
                onChange={(e) => set({ amount: e.target.value })}
              />
            </Field>
            <Field label="상태">
              <select
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                value={editing.draft.status}
                onChange={(e) => set({ status: e.target.value })}
              >
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="보증금 입금일">
              <DateInput aria-label="보증금 입금일" value={editing.draft.paidDate} onChange={(v) => set({ paidDate: v ?? '' })} />
            </Field>
            <Field label="보증금 반환일">
              <DateInput aria-label="보증금 반환일" value={editing.draft.returnedDate} onChange={(v) => set({ returnedDate: v ?? '' })} />
            </Field>
            <Field label="비고" wide>
              <Textarea rows={2} value={editing.draft.memo} onChange={(e) => set({ memo: e.target.value })} />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}>
            취소
          </Button>
          <Button onClick={submit} disabled={pending}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── 전속매체 계약사항 / 보유자산 입력 — 같은 서식, kind 로 구분 ──
type ContractDraft = {
  mediaName: string
  mediaType: string
  ownerName: string
  contractPeriod: string
  contractTerms: string
  hasMonthlyFee: string
  status: ExclusiveContract['status']
  depositPaidDate: string
  depositReturnedDate: string
  memo: string
}
type ContractEditing = { id: number | null; kind: ContractKind; draft: ContractDraft } | null

const emptyContract: ContractDraft = {
  mediaName: '',
  mediaType: '',
  ownerName: '',
  contractPeriod: '',
  contractTerms: '',
  hasMonthlyFee: '',
  status: 'active',
  depositPaidDate: '',
  depositReturnedDate: '',
  memo: '',
}

const contractDraftOf = (r: ExclusiveContract, kind: ContractKind): ContractEditing => ({
  id: r.id,
  kind,
  draft: {
    mediaName: r.mediaName,
    mediaType: r.mediaType ?? '',
    ownerName: r.ownerName ?? '',
    contractPeriod: r.contractPeriod ?? '',
    contractTerms: r.contractTerms ?? '',
    hasMonthlyFee: r.hasMonthlyFee ?? '',
    status: r.status,
    depositPaidDate: r.depositPaidDate ?? '',
    depositReturnedDate: r.depositReturnedDate ?? '',
    memo: r.memo ?? '',
  },
})

function ContractDialog({
  editing,
  setEditing,
  onSaved,
}: {
  editing: ContractEditing
  setEditing: React.Dispatch<React.SetStateAction<ContractEditing>>
  onSaved: (kind: ContractKind, status: ExclusiveContract['status']) => void
}) {
  const { pending, run } = useSave()
  const asset = editing?.kind === 'asset'
  const noun = asset ? '자산' : '계약'
  const nameLabel = asset ? '자산명' : '매체명'
  const typeLabel = asset ? '자산종류' : '매체종류'

  function submit() {
    if (!editing) return
    const d = editing.draft
    run(
      () =>
        saveExclusiveContract(editing.id, {
          ...d,
          kind: editing.kind,
          hasMonthlyFee: d.hasMonthlyFee === 'O' || d.hasMonthlyFee === 'X' ? d.hasMonthlyFee : null,
          depositPaidDate: d.depositPaidDate || null,
          depositReturnedDate: d.depositReturnedDate || null,
        }),
      () => {
        onSaved(editing.kind, d.status)
        setEditing(null)
      },
    )
  }

  const set = (patch: Partial<ContractDraft>) =>
    setEditing((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p))

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing?.id != null ? `${noun} 수정` : asset ? '자산 추가' : '전속계약 추가'}</DialogTitle>
        </DialogHeader>
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={nameLabel} required>
              <Input value={editing.draft.mediaName} onChange={(e) => set({ mediaName: e.target.value })} />
            </Field>
            <Field label={typeLabel}>
              <Input
                value={editing.draft.mediaType}
                placeholder="외벽(성수) / 팬클럽 ..."
                onChange={(e) => set({ mediaType: e.target.value })}
              />
            </Field>
            <Field label="담당자">
              <Input value={editing.draft.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
            </Field>
            <Field label="계약기간">
              <Input
                value={editing.draft.contractPeriod}
                placeholder="2026.01.01~2027.12.31"
                onChange={(e) => set({ contractPeriod: e.target.value })}
              />
            </Field>
            <Field label="계약내용" wide>
              <Textarea rows={2} value={editing.draft.contractTerms} onChange={(e) => set({ contractTerms: e.target.value })} />
            </Field>
            <Field label="월 고정비 여부">
              <select
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                value={editing.draft.hasMonthlyFee}
                onChange={(e) => set({ hasMonthlyFee: e.target.value })}
              >
                <option value="">-</option>
                <option value="O">O</option>
                <option value="X">X</option>
              </select>
            </Field>
            <Field label="상태">
              <select
                aria-label="상태"
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                value={editing.draft.status}
                onChange={(e) => set({ status: e.target.value as ExclusiveContract['status'] })}
              >
                {(['active', 'ended'] as const).map((s) => (
                  <option key={s} value={s}>
                    {CONTRACT_STATUS_LABEL[editing.kind][s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="보증금 입금일">
              <DateInput aria-label="보증금 입금일" value={editing.draft.depositPaidDate} onChange={(v) => set({ depositPaidDate: v ?? '' })} />
            </Field>
            <Field label="보증금 반환일">
              <DateInput aria-label="보증금 반환일" value={editing.draft.depositReturnedDate} onChange={(v) => set({ depositReturnedDate: v ?? '' })} />
            </Field>
            <Field label="비고" wide>
              <Textarea rows={2} value={editing.draft.memo} onChange={(e) => set({ memo: e.target.value })} />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}>
            취소
          </Button>
          <Button onClick={submit} disabled={pending}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  required,
  wide,
  children,
}: {
  label: string
  required?: boolean
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid gap-1.5', wide && 'col-span-2')}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  )
}
