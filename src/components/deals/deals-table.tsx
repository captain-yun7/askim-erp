'use client'

import { currentFilterParams, pushFilterParams } from '@/lib/filter-nav'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { bulkSetInvoiceDate, deleteDeals, toggleDealPaid, updateDealInline } from '@/server/actions/deals'
import { Badge } from '@/components/ui/badge'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Copy, Landmark, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { AttachmentButton } from '@/components/attachments/attachment-button'
import { cn } from '@/lib/utils'
import { formatDate, formatKRW } from '@/lib/format'
import { incentiveAmount, incentivePercentText, incentiveRate } from '@/lib/incentive'
import { changeTitle, columnChange, type LIST_COLUMN_FIELDS, type RecentChanges } from '@/lib/change-highlight'

type Row = {
  id: string
  dealCode: string
  accrualYear: number
  accrualMonth: number
  currency: string
  status: string
  itemName: string | null
  salesAmountNet: string | null
  salesVat: string | null
  purchaseAmountNet: string | null
  purchaseVat: string | null
  salesAmountGross?: string | null
  purchaseAmountGross?: string | null
  salesMemo?: string | null
  purchaseMemo?: string | null
  profit: string | null
  commissionPct?: string | null
  canViewIncentive?: boolean
  canEditIncentive?: boolean
  salesPaidStatus: string
  purchasePaidStatus: string
  salesDueDate: string | null
  salesPaidDate: string | null
  salesInvoiceDate: string | null
  purchaseDueDate: string | null
  purchasePaidDate: string | null
  purchaseInvoiceDate: string | null
  settlementYear: number | null
  settlementMonth: number | null
  ownerUserId: string | null
  canTogglePaid: boolean
  canDelete?: boolean
  canReview?: boolean
  recentChanges?: RecentChanges
  attachmentCount?: number
  categoryName: string | null
  salesMethodName?: string | null
  reviewStatus?: 'requested' | 'done' | null
  supplierBankName?: string | null
  supplierAccountNo?: string | null
  supplierAccountHolder?: string | null
  ownerName: string | null
  ownerEmail?: string | null
  issuerName: string | null
  advertiserName: string | null
  supplierName: string | null
}


type InlineField =
  | 'salesAmountNet'
  | 'purchaseAmountNet'
  | 'salesInvoiceDate'
  | 'purchaseInvoiceDate'
  | 'salesDueDate'
  | 'salesPaidDate'
  | 'purchaseDueDate'
  | 'purchasePaidDate'
  | 'commissionPct'
  | 'settlement'
  | 'reviewStatus'

/** 인라인 수정 결과를 그 행에만 반영 — 목록 전체를 다시 불러오지 않는다 (성능, 2026-10-09) */
const PatchCtx = createContext<(id: string, patch: Partial<Row>) => void>(() => {})

/** 합계 카드에 영향을 주는 수정(금액·입금/결산)은 화면을 먼저 바꾼 뒤 뒤에서 조용히 다시 불러온다 */
function useRefreshCards() {
  const router = useRouter()
  return useCallback(() => router.refresh(), [router])
}

function useInlineSave(dealId: string) {
  const [pending, start] = useTransition()
  const apply = useContext(PatchCtx)
  const refreshCards = useRefreshCards()
  /** optimistic: 서버 응답 전에 화면을 먼저 바꾸는 setter (실패·응답 시 서버값으로 되돌아감) */
  function save(field: InlineField, value: string | number | null, optimistic?: () => void) {
    start(async () => {
      optimistic?.()
      const res = await updateDealInline(dealId, { field, value })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      apply(dealId, res.row)
      if (field === 'salesAmountNet' || field === 'purchaseAmountNet') refreshCards()
    })
  }
  return { pending, save }
}

/** 금액 셀 — 클릭 → 입력 → Enter/blur 저장. 부가세·총액은 서버에서 10% 재계산 */
function InlineAmount({
  dealId,
  field,
  value,
  enabled,
  className,
  memo,
  memoLabel,
}: {
  dealId: string
  field: 'salesAmountNet' | 'purchaseAmountNet'
  value: string | null
  enabled: boolean
  className?: string
  /** 마우스를 올리면 보여 줄 비고 (2026-09-17 피드백: 매출금 → 매출 비고, 매입금 → 매입 비고) */
  memo?: string | null
  memoLabel?: string
}) {
  const { pending, save } = useInlineSave(dealId)
  const [shown, setShown] = useOptimistic(value)
  const note = memo?.trim() ? `${memoLabel ?? '비고'}: ${memo.trim()}` : null
  // 비고가 있으면 금액 옆에 작은 점으로 알려 준다
  const dot = note ? <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-brand align-middle" /> : null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (!enabled)
    return (
      <span title={note ?? undefined} data-memo={note ? '' : undefined}>
        {dot}
        {formatKRW(value)}
      </span>
    )
  if (editing) {
    return (
      <input
        autoFocus
        className="h-6 w-24 rounded border border-primary bg-background px-1 text-right font-mono text-xs tabular-nums outline-none"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          const cleaned = draft.replace(/,/g, '').trim()
          const num = cleaned === '' ? null : Number(cleaned)
          if (num !== null && !Number.isFinite(num)) return
          const current = value != null ? Math.round(parseFloat(value)) : null
          if (num === current) return
          save(field, num, () => setShown(num != null ? String(num) : null))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button
      type="button"
      title={note ? `${note}\n— 클릭해서 수정 (부가세 10% 자동)` : '클릭해서 수정 (부가세 10% 자동)'}
      data-memo={note ? '' : undefined}
      className={cn('w-full rounded px-0.5 text-right hover:bg-accent/60', pending && 'opacity-70', className)}
      onClick={() => {
        setDraft(shown != null ? String(Math.round(parseFloat(shown))) : '')
        setEditing(true)
      }}
    >
      {dot}
      {formatKRW(shown)}
    </button>
  )
}

/** 인센티브 요율 셀 (2026-10-02 요청) — 기본 5%, 관리자·회계는 클릭해서 고친다. 비우면 기본 요율로 */
function InlineIncentive({ dealId, stored, enabled }: { dealId: string; stored: string | null; enabled: boolean }) {
  const { pending, save } = useInlineSave(dealId)
  const [shown, setShown] = useOptimistic(stored)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const text = `${incentivePercentText(incentiveRate(shown))}%`
  const isDefault = shown === null || shown === ''
  if (!enabled) return <span className={cn(isDefault && 'text-muted-foreground')}>{text}</span>
  if (editing) {
    return (
      <input
        autoFocus
        aria-label="인센티브 요율(%)"
        className="h-6 w-14 rounded border border-primary bg-background px-1 text-right font-mono text-xs tabular-nums outline-none"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          const cleaned = draft.replace(/[%\s]/g, '')
          const num = cleaned === '' ? null : Number(cleaned)
          if (num !== null && (!Number.isFinite(num) || num < 0 || num > 100)) {
            toast.error('인센티브는 0~100 사이 숫자로 입력하세요')
            return
          }
          const next = num === null ? null : (Math.round(num * 100) / 10000).toFixed(4)
          if ((next === null ? null : parseFloat(next)) === (isDefault ? null : parseFloat(shown!))) return
          save('commissionPct', num, () => setShown(next))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button
      type="button"
      title={isDefault ? '기본 요율 5% — 클릭해서 수정' : '클릭해서 수정 · 비우면 기본 5%'}
      className={cn('w-full rounded px-0.5 text-right hover:bg-accent/60', pending && 'opacity-70', isDefault && 'text-muted-foreground')}
      onClick={() => {
        setDraft(incentivePercentText(incentiveRate(shown)))
        setEditing(true)
      }}
    >
      {text}
    </button>
  )
}

/** 날짜 셀 — 클릭 → date input. 지우면 날짜 삭제 */
function InlineDate({
  dealId,
  field,
  value,
  enabled,
  muted,
  fallback,
}: {
  dealId: string
  field: InlineField
  value: string | null
  enabled: boolean
  muted?: boolean
  /** 날짜가 없을 때 대신 보여줄 텍스트 (예: 결산연월) */
  fallback?: string | null
}) {
  const { pending, save } = useInlineSave(dealId)
  const [shown, setShown] = useOptimistic(value)
  const [editing, setEditing] = useState(false)
  const label = shown ? formatDate(shown) : (fallback ?? formatDate(shown))
  if (!enabled)
    return <span className={cn(muted && 'text-muted-foreground')}>{label}</span>
  if (editing) {
    return (
      <DateInput
        compact
        autoFocus
        value={value}
        aria-label={`${field} 입력`}
        onCancel={() => setEditing(false)}
        onChange={(v) => {
          setEditing(false)
          if (v === value) return
          save(field, v, () => setShown(v))
        }}
      />
    )
  }
  return (
    <button
      type="button"
      title="클릭해서 날짜 수정"
      className={cn(
        'rounded px-0.5 font-mono tabular-nums hover:bg-accent/60',
        muted && 'text-muted-foreground',
        pending && 'opacity-70',
      )}
      onClick={() => setEditing(true)}
    >
      {label}
    </button>
  )
}

/** 귀속연월 인라인 편집 — 'YY/M' 표시, 클릭 → 'YYYY-MM' 입력 (2026-09-14 피드백) */
function InlineAccrual({ dealId, year, month, enabled }: { dealId: string; year: number; month: number; enabled: boolean }) {
  const [pending, start] = useTransition()
  const apply = useContext(PatchCtx)
  const [shown, setShown] = useOptimistic({ year, month })
  const [editing, setEditing] = useState(false)
  const text = `${String(shown.year).slice(2)}/${shown.month}`
  if (!enabled) return <span className="text-xs text-muted-foreground">{text}</span>
  if (editing) {
    return (
      <input
        autoFocus
        type="month"
        defaultValue={`${year}-${String(month).padStart(2, '0')}`}
        className="h-6 rounded border border-primary bg-background px-1 font-mono text-[11px] outline-none"
        onBlur={(e) => {
          setEditing(false)
          const m = /^(\d{4})-(\d{2})$/.exec(e.target.value)
          if (!m) return
          const next = { year: Number(m[1]), month: Number(m[2]) }
          if (next.year === year && next.month === month) return
          start(async () => {
            setShown(next)
            const res = await updateDealInline(dealId, { field: 'accrual', value: next })
            if ('error' in res) toast.error(res.error)
            else apply(dealId, res.row)
          })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button type="button" title="클릭해서 귀속연월 수정" className={cn('rounded px-0.5 text-xs text-muted-foreground hover:bg-accent/60', pending && 'opacity-70')} onClick={() => setEditing(true)}>
      {text}
    </button>
  )
}

/**
 * 수정요청/완료 표시 (2026-10-08 요청) — 거래 왼쪽의 네모를 누를 때마다 없음 → 수정요청(빨강) → 수정완료(초록) → 없음.
 * 요청한 사람과 처리한 사람이 다르므로 누구나(조회 전용 제외) 바꿀 수 있다.
 */
function ReviewMark({ dealId, value, enabled }: { dealId: string; value: 'requested' | 'done' | null; enabled: boolean }) {
  const [pending, start] = useTransition()
  const apply = useContext(PatchCtx)
  const [shown, setShown] = useOptimistic(value)
  const next = shown === null ? 'requested' : shown === 'requested' ? 'done' : null
  const label = shown === 'requested' ? '수정요청' : shown === 'done' ? '수정완료' : ''
  return (
    <button
      type="button"
      disabled={!enabled || pending}
      data-review={shown ?? 'none'}
      aria-label={`${label || '표시 없음'} — 눌러서 ${next === 'requested' ? '수정요청' : next === 'done' ? '수정완료' : '표시 지우기'}`}
      title={enabled ? `한 번 누르면 수정요청, 한 번 더 누르면 수정완료, 다시 누르면 지움` : label}
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-1 rounded border px-1 text-[10.5px] font-semibold leading-none',
        shown === 'requested' && 'border-red-300 bg-red-50 text-red-600',
        shown === 'done' && 'border-emerald-300 bg-emerald-50 text-emerald-700',
        shown === null && 'border-slate-300 bg-white text-transparent hover:border-slate-500',
        pending && 'opacity-60',
      )}
      onClick={() => {
        if (!enabled) return
        start(async () => {
          setShown(next)
          const res = await updateDealInline(dealId, { field: 'reviewStatus', value: next })
          if ('error' in res) toast.error(res.error)
          else apply(dealId, res.row)
        })
      }}
    >
      {label || '·'}
    </button>
  )
}

/** 매체사 계좌정보 (2026-10-08 요청) — 평소엔 숨기고 아이콘을 누르면 펼친다 */
function BankInfo({ name, bank, account, holder }: { name: string | null; bank: string | null; account: string | null; holder: string | null }) {
  const [open, setOpen] = useState(false)
  if (!bank && !account && !holder) return null
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`${name ?? '매체사'} 계좌정보`}
        title="계좌정보 보기"
        className={cn('rounded p-0.5 text-slate-400 hover:bg-accent/60 hover:text-foreground', open && 'text-foreground')}
        onClick={() => setOpen((o) => !o)}
      >
        <Landmark className="size-3.5" />
      </button>
      {open && (
        <span data-slot="bank-info" className="absolute left-0 top-full z-30 mt-1 w-max rounded-lg border bg-popover px-3 py-2 text-[12px] text-popover-foreground shadow-md">
          <span className="block"><span className="text-muted-foreground">은행</span> {bank ?? '-'}</span>
          <span className="block font-mono"><span className="font-sans text-muted-foreground">계좌</span> {account ?? '-'}</span>
          <span className="block"><span className="text-muted-foreground">예금주</span> {holder ?? '-'}</span>
        </span>
      )}
    </span>
  )
}

/** 결산연월 인라인 편집 (2026-10-06 요청) — 'YYYY-MM' 표시, 클릭 → month 입력. 비우면 삭제 */
function InlineSettlement({ dealId, year, month, enabled }: { dealId: string; year: number | null; month: number | null; enabled: boolean }) {
  const [pending, start] = useTransition()
  const apply = useContext(PatchCtx)
  const [shown, setShown] = useOptimistic({ year, month })
  const [editing, setEditing] = useState(false)
  const text = shown.year && shown.month ? `${shown.year}-${String(shown.month).padStart(2, '0')}` : '-'
  if (!enabled) return <span className="text-muted-foreground">{text}</span>
  if (editing) {
    return (
      <input
        autoFocus
        type="month"
        aria-label="결산연월 입력"
        defaultValue={shown.year && shown.month ? `${shown.year}-${String(shown.month).padStart(2, '0')}` : ''}
        className="h-6 rounded border border-primary bg-background px-1 font-mono text-[11px] outline-none"
        onBlur={(e) => {
          setEditing(false)
          const m = /^(\d{4})-(\d{2})$/.exec(e.target.value)
          const next = m ? { year: Number(m[1]), month: Number(m[2]) } : e.target.value === '' ? { year: null, month: null } : null
          if (!next || (next.year === year && next.month === month)) return
          start(async () => {
            setShown(next)
            const res = await updateDealInline(dealId, { field: 'settlement', value: next })
            if ('error' in res) toast.error(res.error)
            else apply(dealId, res.row)
          })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button type="button" title="클릭해서 결산연월 수정" className={cn('rounded px-0.5 font-mono tabular-nums text-muted-foreground hover:bg-accent/60', pending && 'opacity-70')} onClick={() => setEditing(true)}>
      {text}
    </button>
  )
}

function PaidToggle({
  dealId,
  side,
  done,
  doneLabel,
  todoLabel,
  enabled,
}: {
  dealId: string
  side: 'sales' | 'purchase'
  done: boolean
  doneLabel: string
  todoLabel: string
  enabled: boolean
}) {
  const [pending, start] = useTransition()
  const apply = useContext(PatchCtx)
  const refreshCards = useRefreshCards()
  const [shown, setShown] = useOptimistic(done)
  if (!enabled) return <StatusPill done={done} doneLabel={doneLabel} todoLabel={todoLabel} />
  return (
    <button
      type="button"
      title={shown ? `클릭하면 ${todoLabel}(으)로 되돌립니다` : `클릭하면 ${doneLabel} 처리(오늘 날짜)`}
      className={cn('transition-transform hover:scale-105', pending && 'opacity-70')}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setShown(!done)
          const res = await toggleDealPaid(dealId, side)
          if ('error' in res) {
            toast.error(res.error)
            return
          }
          apply(dealId, res.row)
          refreshCards()
        })
      }
    >
      <StatusPill done={shown} doneLabel={doneLabel} todoLabel={todoLabel} />
    </button>
  )
}

function StatusPill({ done, doneLabel, todoLabel }: { done: boolean; doneLabel: string; todoLabel: string; }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[12px]',
        done ? 'text-success-foreground' : 'text-accent-foreground',
      )}
    >
      <span className={cn('size-[7px] rounded-full', done ? 'bg-success' : 'bg-brand')} />
      {done ? doneLabel : todoLabel}
    </span>
  )
}

/** 담당자에게 보낼 메일 제목·본문 (거래 요약) */
function mailDraft(r: Row): { subject: string; body: string } {
  const won = (v: string | null) => (v ? formatKRW(v) + '원' : '-')
  const lines = [
    `거래코드: ${r.dealCode}`,
    `귀속: ${r.accrualYear}년 ${r.accrualMonth}월`,
    `발행처/광고주: ${r.issuerName ?? '-'}${r.advertiserName && r.advertiserName !== r.issuerName ? ` → ${r.advertiserName}` : ''}`,
    `매체사: ${r.supplierName ?? '-'}`,
    `품목: ${r.itemName ?? '-'}`,
    `매출: ${won(r.salesAmountNet)} (부가세 ${won(r.salesVat)})`,
    `매입: ${won(r.purchaseAmountNet)} (부가세 ${won(r.purchaseVat)})`,
    `손익: ${won(r.profit)}`,
    `입금: ${r.salesPaidStatus === 'completed' ? '완료' : '미입금'} / 결산: ${r.purchasePaidStatus === 'completed' ? '완료' : '미결산'}`,
  ]
  return { subject: `[ASKIM ERP] ${r.dealCode} ${r.issuerName ?? ''} 거래 문의`, body: lines.join('\n') + '\n\n' }
}

/** 네이버웍스 메일 쓰기 창 (2026-09-16 피드백: 사내 메일이 네이버웍스). 받는사람·제목·본문을 넘기되, 웍스가 본문을 안 채워 주는 경우에 대비해 클립보드에도 복사 */
const WORKS_COMPOSE = 'https://mail.worksmobile.com/write/popup'
function worksMailHref(r: Row): string {
  const { subject, body } = mailDraft(r)
  const q = new URLSearchParams({ to: r.ownerEmail ?? '', subject, body })
  return `${WORKS_COMPOSE}?${q.toString()}`
}

function OwnerMailLink({ r, owner }: { r: Row; owner: string }) {
  return (
    <a
      href={worksMailHref(r)}
      target="_blank"
      rel="noopener noreferrer"
      data-owner-mail={r.ownerEmail ?? ''}
      title={`${owner}에게 네이버웍스 메일 쓰기 — 거래 정보가 클립보드에 복사됩니다 (본문에 붙여넣기)`}
      className="text-[13px] underline decoration-dotted underline-offset-4 hover:text-brand"
      onClick={() => {
        const { subject, body } = mailDraft(r)
        const text = `받는사람: ${r.ownerEmail}\n제목: ${subject}\n\n${body}`
        navigator.clipboard
          ?.writeText(text)
          .then(() => toast.success('거래 정보를 복사했습니다', { description: '네이버웍스 메일 본문에 붙여넣기(Ctrl+V) 하세요' }))
          .catch(() => {})
      }}
    >
      {owner}
    </a>
  )
}

export type ColumnFilters = {
  fCode?: string
  fIssuer?: string
  fSupplier?: string
  fItem?: string
  fSales?: string
  fSalesVat?: string
  fPurchase?: string
  fPurchaseVat?: string
  fProfit?: string
  fSalesGross?: string
  fPurchaseGross?: string
  fPaid?: 'paid' | 'unpaid'
  fSettled?: 'settled' | 'unsettled'
  fSalesInvoice?: string
  fPurchaseInvoice?: string
  fSalesDue?: string
  fSalesPaid?: string
  fPurchaseDue?: string
  fPurchasePaid?: string
}

/** 처음에 그리는 행 수 · 스크롤마다 더 그리는 행 수 */
const ROW_STEP = 150

const AMOUNT_HINT = '금액 검색: 800000 정확히 · >1000000 · <=500000 · 100000~500000 범위 · - 비어있음'
const DATE_HINT = '날짜 검색: 2026 · 2026-09 · 2026-09-05 · 2026-09-01~2026-09-15 범위 · - 비어있음 · + 입력된 것만'

function applyColumnFilter(router: ReturnType<typeof useRouter>, param: string, value: string) {
  const next = currentFilterParams('/deals')
  // 다른 칸에 입력만 해 두고 Enter 를 안 누른 검색어도 함께 적용한다 — 칸에 보이는 글자와 실제 필터가 어긋나지 않게
  document.querySelectorAll<HTMLInputElement>('input[data-column-filter]').forEach((el) => {
    const typed = el.value.trim()
    if (typed === (el.dataset.applied ?? '')) return
    if (typed) next.set(el.dataset.columnFilter!, typed)
    else next.delete(el.dataset.columnFilter!)
  })
  const v = value.trim()
  if (v) next.set(param, v)
  else next.delete(param)
  next.delete('page')
  pushFilterParams(router, '/deals', next)
}

const filterInputClass =
  'h-6 w-full min-w-16 rounded border bg-background px-1.5 text-[11px] font-normal placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none'

/** 컬럼별 검색 입력 (엑셀 자동필터처럼 헤더 아래 행) — Enter 로 적용, 비우면 해제 */
function ColumnFilterInput({
  param,
  value,
  placeholder,
  title,
  align,
}: {
  param: string
  value?: string
  placeholder: string
  title?: string
  align?: 'right'
}) {
  const router = useRouter()

  return (
    <input
      // 뒤로가기 등으로 주소의 필터가 바뀌면 칸의 글자도 그 값으로 다시 맞춘다
      key={value ?? ''}
      data-column-filter={param}
      data-applied={value ?? ''}
      aria-label={`${param} 검색`}
      defaultValue={value ?? ''}
      placeholder={placeholder}
      title={title}
      className={cn(filterInputClass, align === 'right' && 'text-right')}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        applyColumnFilter(router, param, (e.target as HTMLInputElement).value)
      }}
    />
  )
}

/** 입금/결산 상태 셀렉트 — 선택 즉시 적용 */
function ColumnFilterSelect({
  param,
  value,
  title,
  options,
  ariaLabel,
}: {
  param: string
  value?: string
  title: string
  options: { value: string; label: string }[]
  ariaLabel?: string
}) {
  const router = useRouter()

  return (
    <select
      data-prehydrate-param={param}
      aria-label={ariaLabel ?? `${param} 검색`}
      title={title}
      value={value ?? ''}
      className={cn(filterInputClass, 'w-16 min-w-0 px-0.5', !value && 'text-muted-foreground/70')}
      onChange={(e) => applyColumnFilter(router, param, e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function FilterHeaderRow({ filters }: { filters: ColumnFilters }) {
  // 금액도 "공백 / 입력됨"으로 거를 수 있게 (2026-10-08 요청) — 셀렉트가 검색식 '-' / '+' 를 대신 넣는다
  const amount = (param: keyof ColumnFilters) => {
    const v = filters[param]
    const mode = v === '-' ? '-' : v === '+' ? '+' : ''
    return (
      <TableHead className="py-1">
        <div className="flex flex-col gap-1">
          <ColumnFilterInput param={param} value={mode ? '' : v} placeholder="금액" title={AMOUNT_HINT} align="right" />
          <ColumnFilterSelect
            param={param}
            value={mode}
            ariaLabel={`${param} 공백 여부`}
            title="공백 여부"
            options={[
              { value: '', label: '전체' },
              { value: '-', label: '공백' },
              { value: '+', label: '입력됨' },
            ]}
          />
        </div>
      </TableHead>
    )
  }
  // 계산서 발행일은 "공백 / 입력됨"으로도 거를 수 있게 (2026-09-22 피드백) — 셀렉트가 검색식 '-' / '+' 를 대신 넣는다
  const date = (param: keyof ColumnFilters) => {
    const v = filters[param]
    const mode = v === '-' ? '-' : v === '+' ? '+' : ''
    return (
      <TableHead className="py-1">
        <div className="flex flex-col gap-1">
          <ColumnFilterInput param={param} value={mode ? '' : v} placeholder="YYYY-MM-DD" title={DATE_HINT} />
          <ColumnFilterSelect
            param={param}
            value={mode}
            ariaLabel={`${param} 공백 여부`}
            title="공백 여부"
            options={[
              { value: '', label: '전체' },
              { value: '-', label: '공백' },
              { value: '+', label: '입력됨' },
            ]}
          />
        </div>
      </TableHead>
    )
  }
  const datePair = (top: keyof ColumnFilters, topLabel: string, bottom: keyof ColumnFilters, bottomLabel: string) => (
    <TableHead className="py-1">
      <div className="flex flex-col gap-1">
        <ColumnFilterInput param={top} value={filters[top]} placeholder={topLabel} title={`${topLabel} — ${DATE_HINT}`} />
        <ColumnFilterInput param={bottom} value={filters[bottom]} placeholder={bottomLabel} title={`${bottomLabel} — ${DATE_HINT}`} />
      </div>
    </TableHead>
  )
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="py-1">
        <ColumnFilterInput param="fCode" value={filters.fCode} placeholder="검색" />
      </TableHead>
      <TableHead colSpan={4} />
      <TableHead className="py-1">
        <ColumnFilterInput param="fIssuer" value={filters.fIssuer} placeholder="발행처/광고주 검색" />
      </TableHead>
      <TableHead className="py-1">
        <ColumnFilterInput param="fSupplier" value={filters.fSupplier} placeholder="매체사 검색" />
      </TableHead>
      <TableHead className="py-1">
        <ColumnFilterInput param="fItem" value={filters.fItem} placeholder="품목명 검색" />
      </TableHead>
      {amount('fSales')}
      {amount('fSalesVat')}
      {amount('fSalesGross')}
      {amount('fPurchase')}
      {amount('fPurchaseVat')}
      {amount('fPurchaseGross')}
      <TableHead className="py-1">
        <div className="flex gap-1">
          <ColumnFilterSelect
            param="fPaid"
            value={filters.fPaid}
            title="입금 상태"
            options={[
              { value: '', label: '전체' },
              { value: 'paid', label: '입금' },
              { value: 'unpaid', label: '미입금' },
            ]}
          />
          <ColumnFilterSelect
            param="fSettled"
            value={filters.fSettled}
            title="결산 상태"
            options={[
              { value: '', label: '전체' },
              { value: 'settled', label: '결산' },
              { value: 'unsettled', label: '미결산' },
            ]}
          />
        </div>
      </TableHead>
      <TableHead />
      {date('fSalesInvoice')}
      {date('fPurchaseInvoice')}
      {/* 헤더가 두 줄(예정일/실제일)인 컬럼은 필터도 두 칸 (2026-09-16 피드백) */}
      {datePair('fSalesDue', '입금예정', 'fSalesPaid', '입금일')}
      {datePair('fPurchaseDue', '결산연월', 'fPurchasePaid', '결산일')}
      {amount('fProfit')}
      <TableHead colSpan={2} />
    </TableRow>
  )
}

function IncentiveAmountCell({ show, profit, stored }: { show: boolean; profit: string | null; stored: string | null }) {
  const amount = show ? incentiveAmount(profit, stored) : null
  if (amount === null) return <span className="text-muted-foreground/60">-</span>
  return <span className={cn(amount < 0 && 'text-destructive')}>{formatKRW(amount)}</span>
}

type Picked = { id: string; code: string; canEdit: boolean; canDelete: boolean }

/**
 * 체크박스로 고른 거래 일괄 작업 (2026-09-17 피드백): 계산서 발행일 한 번에 지정 · 여러 건 삭제.
 * 선택 상태를 표 컴포넌트에 두면 체크할 때마다 수백 행이 다시 그려지므로, 체크박스는 비제어로 두고 여기서 change 이벤트만 모아 센다.
 */
function BulkBar({ container, showAll }: { container: React.RefObject<HTMLDivElement | null>; showAll: () => boolean }) {
  const router = useRouter()
  const [picked, setPicked] = useState<Picked[]>([])
  const [side, setSide] = useState<'sales' | 'purchase'>('sales')
  const [date, setDate] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    const root = container.current
    if (!root) return
    // 새로 마운트될 때(필터 변경) 남아 있던 체크를 지운다
    for (const b of root.querySelectorAll<HTMLInputElement>('input[data-row-select], input[data-select-all]')) b.checked = false
    const boxes = () => [...root.querySelectorAll<HTMLInputElement>('input[data-row-select]')]
    const read = () =>
      setPicked(
        boxes()
          .filter((b) => b.checked)
          .map((b) => ({ id: b.dataset.id!, code: b.dataset.code ?? '', canEdit: b.dataset.canEdit === '1', canDelete: b.dataset.canDelete === '1' })),
      )
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement
      if (t.matches?.('input[data-select-all]')) {
        // 아직 그리지 않은 행이 있으면 먼저 다 그리고(렌더 뒤 이 이벤트가 다시 온다) 그때 선택한다
        if (t.checked && showAll()) return
        for (const b of boxes()) b.checked = t.checked
      } else if (!t.matches?.('input[data-row-select]')) return
      read()
    }
    root.addEventListener('change', onChange)
    // 체크박스 이벤트를 받기 시작했다는 표시 — 화면이 뜬 직후 눌린 체크가 무시되는 걸 테스트에서 피하려고
    root.dataset.bulkReady = ''
    return () => {
      root.removeEventListener('change', onChange)
      delete root.dataset.bulkReady
    }
  }, [container, showAll])

  function clear() {
    const root = container.current
    if (root) for (const b of root.querySelectorAll<HTMLInputElement>('input[data-row-select], input[data-select-all]')) b.checked = false
    setPicked([])
  }

  if (picked.length === 0) return null
  const editable = picked.filter((p) => p.canEdit)
  const deletable = picked.filter((p) => p.canDelete)

  function applyInvoiceDate() {
    if (editable.length === 0) return
    start(async () => {
      const res = await bulkSetInvoiceDate({ ids: editable.map((p) => p.id), side, date })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      const label = side === 'sales' ? '매출계산서' : '매입계산서'
      toast.success(`${label} 발행일을 ${res.updated}건에 ${date ?? '비움'}(으)로 적용했습니다`, res.skipped ? { description: `권한이 없는 ${res.skipped}건은 건너뛰었습니다` } : undefined)
      clear()
      router.refresh()
    })
  }

  function removePicked() {
    if (deletable.length === 0) {
      toast.error('삭제할 수 있는 거래가 없습니다', { description: '본인 거래만 삭제할 수 있습니다' })
      return
    }
    const skip = picked.length - deletable.length
    // 확인 메시지는 한 번만 (고객 요청)
    if (!confirm(`선택한 거래 ${deletable.length}건을 삭제하시겠습니까?${skip ? `\n(삭제 권한이 없는 ${skip}건은 제외됩니다)` : ''}`)) return
    start(async () => {
      const res = await deleteDeals(deletable.map((p) => p.id))
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(`거래 ${res.deleted}건을 삭제했습니다`)
      clear()
      router.refresh()
    })
  }

  return (
    <div data-slot="deals-bulk-bar" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/50 px-4 py-2 text-[12.5px]">
      <span>
        <b>{picked.length}</b>건 선택
      </span>
      <span className="h-4 w-px bg-border" />
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground">계산서 발행일 일괄 수정</span>
        <select
          aria-label="계산서 구분"
          className="h-7 rounded-md border bg-background px-1.5 text-[12.5px]"
          value={side}
          onChange={(e) => setSide(e.target.value as 'sales' | 'purchase')}
        >
          <option value="sales">매출계산서</option>
          <option value="purchase">매입계산서</option>
        </select>
        <DateInput compact aria-label="일괄 발행일" value={date} onChange={setDate} className="w-[104px]" inputClassName="h-7 w-[104px] border-input" />
        <Button size="sm" className="h-7" disabled={pending || editable.length === 0} onClick={applyInvoiceDate} title={date ? undefined : '날짜를 비워 두면 발행일을 지웁니다'}>
          {pending ? '적용 중...' : `${editable.length}건에 적용`}
        </Button>
      </span>
      <span className="h-4 w-px bg-border" />
      <Button size="sm" variant="destructive" className="h-7 gap-1.5" disabled={pending} onClick={removePicked}>
        <Trash2 className="size-3.5" />
        선택 삭제
      </Button>
      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={clear}>
        선택 해제
      </button>
    </div>
  )
}

export function DealsTable({ rows: serverRows, columnFilters = {}, canCopy = false }: { rows: Row[]; columnFilters?: ColumnFilters; canCopy?: boolean }) {
  // 인라인 수정 결과는 서버가 돌려준 그 행 값으로 덮어쓴다. 서버 목록이 새로 오면 비운다
  const [patches, setPatches] = useState<Record<string, Partial<Row>>>({})
  useEffect(() => setPatches({}), [serverRows])
  const apply = useCallback((id: string, patch: Partial<Row>) => setPatches((s) => ({ ...s, [id]: { ...s[id], ...patch } })), [])
  const rows = useMemo(() => serverRows.map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r)), [serverRows, patches])
  const hasFilter = Object.values(columnFilters).some(Boolean)
  // 상세에서 돌아올 때 필터 유지 (2026-09-14 피드백)
  const search = useSearchParams().toString()
  const container = useRef<HTMLDivElement>(null)
  // 성능(2026-10-09): 1,800행을 한 번에 그리면 HTML 20MB·6초. 처음 150행만 그리고 끝에 닿으면 이어 그린다
  const [limit, setLimit] = useState(ROW_STEP)
  const wantAll = useRef(false)
  const moreRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => setLimit(ROW_STEP), [search])
  useEffect(() => {
    const el = moreRef.current
    if (!el) return
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setLimit((l) => l + ROW_STEP)
    }, { root: container.current?.querySelector('[data-slot=deals-scroll]'), rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [limit, rows.length])
  const showAll = useCallback(() => {
    if (limit >= rows.length) return false
    wantAll.current = true
    setLimit(rows.length)
    return true
  }, [limit, rows.length])
  useEffect(() => {
    if (!wantAll.current || limit < rows.length) return
    wantAll.current = false
    const all = container.current?.querySelector<HTMLInputElement>('input[data-select-all]')
    if (all) {
      all.checked = true
      all.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, [limit, rows.length])
  const detailHref = (id: string) => `/deals/${id}${search ? `?back=${encodeURIComponent('/deals?' + search)}` : ''}`
  if (rows.length === 0 && !hasFilter) {
    return (
      <div className="px-6 py-20 text-center text-sm text-muted-foreground">
        거래가 없습니다. 필터를 조정하거나 [+ 새 거래]를 눌러보세요.
      </div>
    )
  }
  return (
    <PatchCtx.Provider value={apply}>
    <div ref={container} className="flex min-h-0 flex-1 flex-col">
    {/* 필터·검색이 바뀌면 선택을 비운다 */}
    <BulkBar key={search} container={container} showAll={showAll} />
    {/* 표 자체가 가로·세로 스크롤 상자(남은 화면 높이를 채움) — 헤더 두 줄은 상자 상단에 고정, 가로 스크롤바는 상자 하단(항상 화면 안)에 보임. */}
    <div
      data-slot="deals-scroll"
      className={cn(
        'min-h-0 flex-1 overflow-auto overscroll-contain border-b',
        '[&::-webkit-scrollbar]:size-2.5 [&::-webkit-scrollbar-track]:bg-muted/60 [&::-webkit-scrollbar-corner]:bg-muted/60',
        '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/50',
      )}
    >
      <table className="w-full caption-bottom text-sm">
        {/* border-collapse 표에서 sticky 헤더의 행 테두리는 틈이 생겨 아래 글자가 비친다 → 테두리 대신 셀 안쪽 그림자로 선을 그린다 */}
        <TableHeader className="sticky top-0 z-20 bg-card [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <TableHead>
              <span className="flex items-center gap-2">
                <input type="checkbox" data-select-all aria-label="전체 선택" title="화면의 거래 전체 선택" className="size-3.5 accent-[var(--primary)]" />
                거래코드
              </span>
            </TableHead>
            <TableHead className="w-16 text-center" title="첨부파일 · 복사">📎</TableHead>
            <TableHead>귀속</TableHead>
            <TableHead>상품구분</TableHead>
            <TableHead>담당</TableHead>
            <TableHead>발행처 / 광고주</TableHead>
            <TableHead>매체사</TableHead>
            <TableHead>품목명</TableHead>
            <TableHead className="text-right">매출</TableHead>
            <TableHead className="text-right">부가세</TableHead>
            <TableHead className="text-right" title="매출금 + 부가세">총매출<br />(VAT 포함)</TableHead>
            <TableHead className="text-right">매입</TableHead>
            <TableHead className="text-right">부가세</TableHead>
            <TableHead className="text-right" title="매입금 + 부가세">총매입<br />(VAT 포함)</TableHead>
            <TableHead className="text-center">입금 / 결산</TableHead>
            <TableHead>매출수단</TableHead>
            <TableHead>매출계산서<br />발행일</TableHead>
            <TableHead>매입계산서<br />발행일</TableHead>
            <TableHead>입금예정일<br />입금일</TableHead>
            <TableHead>결산연월<br />결산일</TableHead>
            {/* 손익 → 인센티브 → 성과급 순으로 맨 오른쪽 (2026-10-06 고객 요청) */}
            <TableHead className="text-right">손익</TableHead>
            <TableHead className="text-right" title="기본 5% · 거래마다 따로 정할 수 있습니다">인센티브<br />(%)</TableHead>
            <TableHead className="text-right" title="인센티브(%) × 손익">성과급</TableHead>
          </TableRow>
          <FilterHeaderRow filters={columnFilters} />
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={23} className="py-14 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다. 필터 입력을 비우고 Enter 를 누르면 해제됩니다.
              </TableCell>
            </TableRow>
          )}
          {rows.slice(0, limit).map((r) => {
            const owner = r.ownerName ?? '-'
            const loss = parseFloat(r.profit ?? '0') < 0
            /** 최근 수정된 칸 음영 + 툴팁 */
            const hl = (col: keyof typeof LIST_COLUMN_FIELDS) => {
              const c = columnChange(r.recentChanges, col)
              return c ? { className: 'bg-yellow-100/80 dark:bg-yellow-900/30', title: changeTitle(c), 'data-changed': '1' as const } : {}
            }
            const cell = (col: keyof typeof LIST_COLUMN_FIELDS, className?: string) => {
              const h = hl(col)
              return { ...h, className: cn(className, h.className) }
            }
            return (
              <TableRow key={r.id} className="hover:bg-muted/60">
                <TableCell {...cell('code')}>
                  <span className="flex items-center gap-2">
                  <ReviewMark dealId={r.id} value={r.reviewStatus ?? null} enabled={r.canReview !== false} />
                  {(r.canTogglePaid || r.canDelete) && (
                    <input
                      type="checkbox"
                      data-row-select
                      data-id={r.id}
                      data-code={r.dealCode}
                      data-can-edit={r.canTogglePaid ? '1' : '0'}
                      data-can-delete={r.canDelete ? '1' : '0'}
                      aria-label={`${r.dealCode} 선택`}
                      className="size-3.5 shrink-0 accent-[var(--primary)]"
                    />
                  )}
                  <span>
                  <Link
                    prefetch={false}
                    href={detailHref(r.id)}
                    className="text-[13px] font-medium tabular-nums text-foreground hover:text-brand"
                  >
                    {r.dealCode}
                  </Link>
                  {r.currency !== 'KRW' && (
                    <Badge variant="outline" className="ml-1">
                      {r.currency}
                    </Badge>
                  )}
                  </span>
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-0.5">
                  <AttachmentButton
                    targetType="deal"
                    targetId={r.id}
                    title={`${r.dealCode} · ${r.issuerName ?? ''}${r.itemName ? ` · ${r.itemName}` : ''}`}
                    count={r.attachmentCount ?? 0}
                    canEdit={r.canTogglePaid}
                  />
                  {canCopy && (
                    <Link
                      prefetch={false}
                      href={`/deals/new?copy=${r.id}`}
                      aria-label={`${r.dealCode} 복사`}
                      title="이 거래를 복사해 새 거래 등록 (거래코드는 새로 채번)"
                      className="grid size-7 place-items-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                    >
                      <Copy className="size-3.5" />
                    </Link>
                  )}
                  </div>
                </TableCell>
                <TableCell {...cell('accrual', 'text-xs text-muted-foreground')}>
                  <InlineAccrual dealId={r.id} year={r.accrualYear} month={r.accrualMonth} enabled={r.canTogglePaid} />
                </TableCell>
                <TableCell {...cell('category')}>
                  {r.categoryName ? (
                    <span className="inline-flex h-[22px] items-center rounded-full bg-info px-2.5 text-[12px] text-info-foreground">
                      {r.categoryName}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell {...cell('owner')}>
                  {r.ownerEmail ? (
                    <OwnerMailLink r={r} owner={owner} />
                  ) : (
                    <span className="text-[13px]">{owner}</span>
                  )}
                </TableCell>
                <TableCell {...cell('issuer', 'text-[13px]')}>
                  <div>{r.issuerName ?? '-'}</div>
                  {r.advertiserName && r.advertiserName !== r.issuerName && (
                    <div className="text-muted-foreground">→ {r.advertiserName}</div>
                  )}
                </TableCell>
                <TableCell {...cell('supplier', 'text-[13px] text-muted-foreground')}>
                  <span className="flex items-center gap-1.5">
                    <span>{r.supplierName ?? '-'}</span>
                    <BankInfo name={r.supplierName} bank={r.supplierBankName ?? null} account={r.supplierAccountNo ?? null} holder={r.supplierAccountHolder ?? null} />
                  </span>
                </TableCell>
                <TableCell {...cell('item', 'max-w-56 truncate text-[12.5px]')} title={r.itemName ?? undefined}>
                  {r.itemName ?? <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell {...cell('salesNet', 'text-right text-[13px] tabular-nums')}>
                  <InlineAmount dealId={r.id} field="salesAmountNet" value={r.salesAmountNet} enabled={r.canTogglePaid} memo={r.salesMemo} memoLabel="매출 비고" />
                </TableCell>
                <TableCell {...cell('salesVat', 'text-right text-[13px] text-muted-foreground tabular-nums')}>
                  {formatKRW(r.salesVat)}
                </TableCell>
                <TableCell className="text-right text-[13px] tabular-nums" data-col="salesGross">
                  {formatKRW(r.salesAmountGross ?? null)}
                </TableCell>
                <TableCell {...cell('purchaseNet', 'text-right text-[13px] tabular-nums')}>
                  <InlineAmount dealId={r.id} field="purchaseAmountNet" value={r.purchaseAmountNet} enabled={r.canTogglePaid} memo={r.purchaseMemo} memoLabel="매입 비고" />
                </TableCell>
                <TableCell {...cell('purchaseVat', 'text-right text-[13px] text-muted-foreground tabular-nums')}>
                  {formatKRW(r.purchaseVat)}
                </TableCell>
                <TableCell className="text-right text-[13px] tabular-nums" data-col="purchaseGross">
                  {formatKRW(r.purchaseAmountGross ?? null)}
                </TableCell>
                <TableCell {...cell('paid')}>
                  <div className="flex justify-center gap-3">
                    {/* 금액 없는 쪽은 입금/결산 표시 안 함 (2026-09-09 피드백). 마이너스 금액(상계·환불)도 표시 (2026-10-06) */}
                    {parseFloat(r.salesAmountNet ?? '0') !== 0 ? (
                      <PaidToggle
                        dealId={r.id}
                        side="sales"
                        done={r.salesPaidStatus === 'completed'}
                        doneLabel="입금"
                        todoLabel="미입금"
                        enabled={r.canTogglePaid}
                      />
                    ) : (
                      <span className="w-12 text-center text-[12px] text-muted-foreground/50">-</span>
                    )}
                    {parseFloat(r.purchaseAmountNet ?? '0') !== 0 ? (
                      <PaidToggle
                        dealId={r.id}
                        side="purchase"
                        done={r.purchasePaidStatus === 'completed'}
                        doneLabel="결산"
                        todoLabel="미결산"
                        enabled={r.canTogglePaid}
                      />
                    ) : (
                      <span className="w-12 text-center text-[12px] text-muted-foreground/50">-</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground" data-col="salesMethod">{r.salesMethodName ?? '-'}</TableCell>
                <TableCell {...cell('salesInvoice', 'text-[12px] tabular-nums')}>
                  <InlineDate dealId={r.id} field="salesInvoiceDate" value={r.salesInvoiceDate} enabled={r.canTogglePaid} muted />
                </TableCell>
                <TableCell {...cell('purchaseInvoice', 'text-[12px] tabular-nums')}>
                  <InlineDate dealId={r.id} field="purchaseInvoiceDate" value={r.purchaseInvoiceDate} enabled={r.canTogglePaid} muted />
                </TableCell>
                <TableCell {...cell('salesDates')}>
                  <div className="text-[12px] leading-tight tabular-nums">
                    <div>
                      <InlineDate dealId={r.id} field="salesDueDate" value={r.salesDueDate} enabled={r.canTogglePaid} muted />
                    </div>
                    <div>
                      <InlineDate dealId={r.id} field="salesPaidDate" value={r.salesPaidDate} enabled={r.canTogglePaid} muted={!r.salesPaidDate} />
                    </div>
                  </div>
                </TableCell>
                <TableCell {...cell('purchaseDates')}>
                  <div className="text-[12px] leading-tight tabular-nums">
                    <div>
                      {/* 결산예정일 대신 결산연월 (2026-10-06 요청) — 클릭해서 YYYY-MM 으로 수정 */}
                      <InlineSettlement dealId={r.id} year={r.settlementYear} month={r.settlementMonth} enabled={r.canTogglePaid} />
                    </div>
                    <div>
                      <InlineDate dealId={r.id} field="purchasePaidDate" value={r.purchasePaidDate} enabled={r.canTogglePaid} muted={!r.purchasePaidDate} />
                    </div>
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right text-[13px] font-medium tabular-nums',
                    loss ? 'text-destructive' : 'text-success-foreground',
                  )}
                >
                  {formatKRW(r.profit)}
                </TableCell>
                <TableCell className="text-right text-[13px] tabular-nums" data-col="incentiveRate">
                  {r.canViewIncentive ? <InlineIncentive dealId={r.id} stored={r.commissionPct ?? null} enabled={Boolean(r.canEditIncentive)} /> : <span className="text-muted-foreground/60">-</span>}
                </TableCell>
                <TableCell className="text-right text-[13px] tabular-nums" data-col="incentiveAmount">
                  <IncentiveAmountCell show={Boolean(r.canViewIncentive)} profit={r.profit} stored={r.commissionPct ?? null} />
                </TableCell>
              </TableRow>
            )
          })}
          {limit < rows.length && (
            <TableRow ref={moreRef} data-slot="deals-more" className="hover:bg-transparent">
              <TableCell colSpan={23} className="py-3 text-center text-[12.5px] text-muted-foreground">
                {rows.length.toLocaleString()}건 중 {Math.min(limit, rows.length).toLocaleString()}건 표시 · 스크롤하면 이어서 보입니다 ·{' '}
                <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setLimit(rows.length)}>
                  전부 보기
                </button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </table>
    </div>
    </div>
    </PatchCtx.Provider>
  )
}
