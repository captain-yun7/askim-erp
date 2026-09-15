'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { toggleDealPaid, updateDealInline } from '@/server/actions/deals'
import { Badge } from '@/components/ui/badge'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StickyHScroll } from '@/components/ui/sticky-h-scroll'
import { cn } from '@/lib/utils'
import { formatDate, formatKRW } from '@/lib/format'
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
  profit: string | null
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
  recentChanges?: RecentChanges
  categoryName: string | null
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

function useInlineSave(dealId: string) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function save(field: InlineField, value: string | number | null) {
    start(async () => {
      const res = await updateDealInline(dealId, { field, value })
      if ('error' in res) toast.error(res.error)
      else router.refresh()
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
}: {
  dealId: string
  field: 'salesAmountNet' | 'purchaseAmountNet'
  value: string | null
  enabled: boolean
  className?: string
}) {
  const { pending, save } = useInlineSave(dealId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (!enabled) return <>{formatKRW(value)}</>
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
          save(field, num)
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
      title="클릭해서 수정 (부가세 10% 자동)"
      className={cn('w-full rounded px-0.5 text-right hover:bg-accent/60', pending && 'opacity-40', className)}
      onClick={() => {
        setDraft(value != null ? String(Math.round(parseFloat(value))) : '')
        setEditing(true)
      }}
    >
      {formatKRW(value)}
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
  const [editing, setEditing] = useState(false)
  const label = value ? formatDate(value) : (fallback ?? formatDate(value))
  if (!enabled)
    return <span className={cn(muted && 'text-muted-foreground')}>{label}</span>
  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        className="h-6 rounded border border-primary bg-background px-1 font-mono text-[11px] outline-none"
        defaultValue={value ?? ''}
        onBlur={(e) => {
          setEditing(false)
          const v = e.target.value || null
          if (v === value) return
          save(field, v)
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
      title="클릭해서 날짜 수정"
      className={cn(
        'rounded px-0.5 font-mono tabular-nums hover:bg-accent/60',
        muted && 'text-muted-foreground',
        pending && 'opacity-40',
      )}
      onClick={() => setEditing(true)}
    >
      {label}
    </button>
  )
}

/** 귀속연월 인라인 편집 — 'YY/M' 표시, 클릭 → 'YYYY-MM' 입력 (2026-09-14 피드백) */
function InlineAccrual({ dealId, year, month, enabled }: { dealId: string; year: number; month: number; enabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const text = `${String(year).slice(2)}/${month}`
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
            const res = await updateDealInline(dealId, { field: 'accrual', value: next })
            if ('error' in res) toast.error(res.error)
            else router.refresh()
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
    <button type="button" title="클릭해서 귀속연월 수정" className={cn('rounded px-0.5 text-xs text-muted-foreground hover:bg-accent/60', pending && 'opacity-40')} onClick={() => setEditing(true)}>
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
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!enabled) return <StatusPill done={done} doneLabel={doneLabel} todoLabel={todoLabel} />
  return (
    <button
      type="button"
      title={done ? `클릭하면 ${todoLabel}(으)로 되돌립니다` : `클릭하면 ${doneLabel} 처리(오늘 날짜)`}
      className={pending ? 'opacity-40' : 'transition-transform hover:scale-105'}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await toggleDealPaid(dealId, side)
          if ('error' in res) toast.error(res.error)
          else router.refresh()
        })
      }
    >
      <StatusPill done={done} doneLabel={doneLabel} todoLabel={todoLabel} />
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

/** 담당자 이름 클릭 → 메일 작성 창 (2026-09-15 확정). 본문은 발신자가 수정 가능 */
function mailtoHref(r: Row): string {
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
  const subject = `[ASKIM ERP] ${r.dealCode} ${r.issuerName ?? ''} 거래 문의`
  return `mailto:${r.ownerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n') + '\n\n')}`
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
  fPaid?: 'paid' | 'unpaid'
  fSettled?: 'settled' | 'unsettled'
  fSalesInvoice?: string
  fPurchaseInvoice?: string
  fSalesDate?: string
  fPurchaseDate?: string
}

const AMOUNT_HINT = '금액 검색: 800000 정확히 · >1000000 · <=500000 · 100000~500000 범위 · - 비어있음'
const DATE_HINT = '날짜 검색: 2026 · 2026-09 · 2026-09-05 · 2026-09-01~2026-09-15 범위 · - 비어있음'

function applyColumnFilter(router: ReturnType<typeof useRouter>, param: string, value: string) {
  const next = new URLSearchParams(window.location.search)
  const v = value.trim()
  if (v) next.set(param, v)
  else next.delete(param)
  next.delete('page')
  router.push(`/deals?${next.toString()}`)
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
}: {
  param: string
  value?: string
  title: string
  options: { value: string; label: string }[]
}) {
  const router = useRouter()
  return (
    <select
      aria-label={`${param} 검색`}
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
  const amount = (param: keyof ColumnFilters) => (
    <TableHead className="py-1">
      <ColumnFilterInput param={param} value={filters[param]} placeholder="금액" title={AMOUNT_HINT} align="right" />
    </TableHead>
  )
  const date = (param: keyof ColumnFilters) => (
    <TableHead className="py-1">
      <ColumnFilterInput param={param} value={filters[param]} placeholder="YYYY-MM" title={DATE_HINT} />
    </TableHead>
  )
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="py-1">
        <ColumnFilterInput param="fCode" value={filters.fCode} placeholder="검색" />
      </TableHead>
      <TableHead colSpan={3} />
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
      {amount('fPurchase')}
      {amount('fPurchaseVat')}
      {amount('fProfit')}
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
      {date('fSalesInvoice')}
      {date('fPurchaseInvoice')}
      {date('fSalesDate')}
      {date('fPurchaseDate')}
    </TableRow>
  )
}

export function DealsTable({ rows, columnFilters = {} }: { rows: Row[]; columnFilters?: ColumnFilters }) {
  const hasFilter = Object.values(columnFilters).some(Boolean)
  // 상세에서 돌아올 때 필터 유지 (2026-09-14 피드백)
  const search = useSearchParams().toString()
  const detailHref = (id: string) => `/deals/${id}${search ? `?back=${encodeURIComponent('/deals?' + search)}` : ''}`
  if (rows.length === 0 && !hasFilter) {
    return (
      <div className="px-6 py-20 text-center text-sm text-muted-foreground">
        거래가 없습니다. 필터를 조정하거나 [+ 새 거래]를 눌러보세요.
      </div>
    )
  }
  return (
    <StickyHScroll>
      <table className="w-full caption-bottom text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>거래코드</TableHead>
            <TableHead>귀속</TableHead>
            <TableHead>상품구분</TableHead>
            <TableHead>담당</TableHead>
            <TableHead>발행처 / 광고주</TableHead>
            <TableHead>매체사</TableHead>
            <TableHead>품목명</TableHead>
            <TableHead className="text-right">매출</TableHead>
            <TableHead className="text-right">부가세</TableHead>
            <TableHead className="text-right">매입</TableHead>
            <TableHead className="text-right">부가세</TableHead>
            <TableHead className="text-right">손익</TableHead>
            <TableHead className="text-center">입금 / 결산</TableHead>
            <TableHead>매출계산서<br />발행일</TableHead>
            <TableHead>매입계산서<br />발행일</TableHead>
            <TableHead>입금예정일<br />입금일</TableHead>
            <TableHead>결산예정일<br />결산일</TableHead>
          </TableRow>
          <FilterHeaderRow filters={columnFilters} />
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={17} className="py-14 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다. 필터 입력을 비우고 Enter 를 누르면 해제됩니다.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
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
                  <Link
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
                    <a
                      href={mailtoHref(r)}
                      title={`${owner}에게 메일 보내기 — 거래 정보가 본문에 채워집니다`}
                      className="text-[13px] underline decoration-dotted underline-offset-4 hover:text-brand"
                    >
                      {owner}
                    </a>
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
                <TableCell {...cell('supplier', 'text-[13px] text-muted-foreground')}>{r.supplierName ?? '-'}</TableCell>
                <TableCell {...cell('item', 'max-w-56 truncate text-[12.5px]')} title={r.itemName ?? undefined}>
                  {r.itemName ?? <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell {...cell('salesNet', 'text-right text-[13px] tabular-nums')}>
                  <InlineAmount dealId={r.id} field="salesAmountNet" value={r.salesAmountNet} enabled={r.canTogglePaid} />
                </TableCell>
                <TableCell {...cell('salesVat', 'text-right text-[13px] text-muted-foreground tabular-nums')}>
                  {formatKRW(r.salesVat)}
                </TableCell>
                <TableCell {...cell('purchaseNet', 'text-right text-[13px] tabular-nums')}>
                  <InlineAmount dealId={r.id} field="purchaseAmountNet" value={r.purchaseAmountNet} enabled={r.canTogglePaid} />
                </TableCell>
                <TableCell {...cell('purchaseVat', 'text-right text-[13px] text-muted-foreground tabular-nums')}>
                  {formatKRW(r.purchaseVat)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right text-[13px] font-medium tabular-nums',
                    loss ? 'text-destructive' : 'text-success-foreground',
                  )}
                >
                  {formatKRW(r.profit)}
                </TableCell>
                <TableCell {...cell('paid')}>
                  <div className="flex justify-center gap-3">
                    {/* 금액 없는 쪽은 입금/결산 표시 안 함 (2026-09-09 피드백) */}
                    {parseFloat(r.salesAmountNet ?? '0') > 0 ? (
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
                    {parseFloat(r.purchaseAmountNet ?? '0') > 0 ? (
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
                      <InlineDate
                        dealId={r.id}
                        field="purchaseDueDate"
                        value={r.purchaseDueDate}
                        enabled={r.canTogglePaid}
                        muted
                        fallback={r.settlementYear && r.settlementMonth ? `${r.settlementYear}-${String(r.settlementMonth).padStart(2, '0')}` : null}
                      />
                    </div>
                    <div>
                      <InlineDate dealId={r.id} field="purchasePaidDate" value={r.purchasePaidDate} enabled={r.canTogglePaid} muted={!r.purchasePaidDate} />
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </table>
    </StickyHScroll>
  )
}
