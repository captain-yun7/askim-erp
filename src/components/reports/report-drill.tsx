'use client'

import Link from 'next/link'
import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'
import { sumAmounts, type DrillDetail, type DrillFormula } from '@/lib/ledger-drill'
import { getReportCellDetail } from '@/server/actions/report-detail'
import { XlsxExportButton } from '@/components/xlsx-export-button'
import { exportReportCellXlsx } from '@/server/actions/report-export'

/** 화면에 있는 행: 이름과 12개월 값 */
export type DrillLine = { label: string; values: number[] }

type Target = { key: string; months: number[] }
type Ctx = { open: (t: Target) => void }
const DrillContext = createContext<Ctx | null>(null)

const won = (v: number) => formatKRW(Math.round(v))
const monthsLabel = (year: number, months: number[]) =>
  months.length === 1 ? `${year}년 ${months[0]}월` : months.length === 12 ? `${year}년 전체` : `${year}년 ${months[0]}~${months[months.length - 1]}월`

/**
 * 리포트 숫자의 근거 보기 (2026-10-06 요청). 표의 숫자를 누르면 그 값이 어떻게 나왔는지 보여 준다.
 * 계산으로 만들어진 행은 구성 행을, 그 아래로는 거래·판관비 목록을 연다.
 */
export function ReportDrill({ year, lines, formulas = {}, children }: { year: number; lines: Record<string, DrillLine>; formulas?: Record<string, DrillFormula>; children: React.ReactNode }) {
  const [stack, setStack] = useState<Target[]>([])
  const [detail, setDetail] = useState<DrillDetail | { error: string } | null>(null)
  const [pending, start] = useTransition()
  const [query, setQuery] = useState('')
  const current = stack[stack.length - 1] ?? null

  const valueOf = (key: string, months: number[]) => months.reduce((a, m) => a + (lines[key]?.values[m - 1] ?? 0), 0)

  function show(next: Target[]) {
    setStack(next)
    setQuery('')
    setDetail(null)
    const t = next[next.length - 1]
    if (!t || formulas[t.key]) return
    start(async () => {
      setDetail(await getReportCellDetail({ year, months: t.months, key: t.key }))
    })
  }

  const ctx = useMemo<Ctx>(() => ({ open: (t) => show([t]) }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const formula = current ? formulas[current.key] : undefined
  const cellValue = current ? valueOf(current.key, current.months) : 0

  return (
    <DrillContext.Provider value={ctx}>
      {children}
      <Dialog open={current !== null} onOpenChange={(o) => !o && show([])}>
        <DialogContent className="flex max-h-[calc(85vh/var(--ui-zoom,1))] flex-col gap-3 sm:max-w-6xl" data-drill-dialog>
          {current && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {stack.length > 1 && (
                    <Button variant="ghost" size="icon" className="size-7" aria-label="이전 단계" onClick={() => show(stack.slice(0, -1))}>
                      <ArrowLeft className="size-4" />
                    </Button>
                  )}
                  <span>{lines[current.key]?.label ?? current.key}</span>
                  <span className="text-sm font-normal text-muted-foreground">· {monthsLabel(year, current.months)}</span>
                </DialogTitle>
                <DialogDescription>
                  표의 값 <b className="text-foreground tabular-nums" data-slot="drill-cell-value">₩ {won(cellValue)}</b>
                  {formula ? ` — ${formula.note ?? '아래 행을 더하고 빼서 나온 값입니다. 행을 누르면 더 자세히 볼 수 있습니다'}` : detail && 'basis' in detail ? ` — ${detail.basis}` : ''}
                </DialogDescription>
              </DialogHeader>

              {formula ? (
                <FormulaView formula={formula} lines={lines} months={current.months} valueOf={valueOf} onPick={(key) => show([...stack, { key, months: current.months }])} />
              ) : pending || !detail ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  내역을 불러오는 중…
                </div>
              ) : 'error' in detail ? (
                <div className="py-12 text-center text-sm text-destructive">{detail.error}</div>
              ) : (
                <DetailView detail={detail} cellValue={cellValue} query={query} setQuery={setQuery} exportArgs={{ year, months: current.months, key: current.key, title: lines[current.key]?.label ?? current.key }} />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </DrillContext.Provider>
  )
}

/** 표의 숫자 칸 — 누르면 근거를 연다 */
export function DrillButton({ lineKey, months, className, children }: { lineKey: string; months: number[]; className?: string; children: React.ReactNode }) {
  const ctx = useContext(DrillContext)
  if (!ctx) return <>{children}</>
  return (
    <button
      type="button"
      data-drill={lineKey}
      title="눌러서 근거 내역 보기"
      className={cn('-mx-1 rounded px-1 underline-offset-4 hover:bg-foreground/10 hover:underline focus-visible:outline-2 focus-visible:outline-ring', className)}
      onClick={() => ctx.open({ key: lineKey, months })}
    >
      {children}
    </button>
  )
}

function FormulaView({ formula, lines, months, valueOf, onPick }: { formula: DrillFormula; lines: Record<string, DrillLine>; months: number[]; valueOf: (key: string, months: number[]) => number; onPick: (key: string) => void }) {
  const parts = formula.parts.map((p) => ({ ...p, label: lines[p.key]?.label ?? p.key, value: valueOf(p.key, months) }))
  const shown = parts.filter((p) => Math.round(p.value) !== 0 || parts.length <= 3)
  const total = parts.reduce((a, p) => a + p.sign * p.value, 0) * (formula.factor ?? 1)
  return (
    <div className="min-h-0 overflow-auto rounded-xl border">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-slate-100 text-[12px] text-slate-700">
          <tr>
            <th className="w-12 px-3 py-2 text-center font-semibold">계산</th>
            <th className="px-3 py-2 text-left font-semibold">행</th>
            <th className="px-3 py-2 text-right font-semibold">금액</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p, i) => (
            <tr key={p.key} className="cursor-pointer border-t hover:bg-sky-50" onClick={() => onPick(p.key)}>
              <td className={cn('px-3 py-2 text-center font-mono text-base', p.sign < 0 ? 'text-red-600' : 'text-slate-500')}>{p.sign < 0 ? '−' : i === 0 ? '' : '+'}</td>
              <td className="px-3 py-2">
                <button type="button" className="font-medium text-sky-800 underline underline-offset-4" data-part={p.key}>
                  {p.label}
                </button>
              </td>
              <td className={cn('px-3 py-2 text-right tabular-nums', p.value < 0 && 'text-red-600')}>{won(p.value)}</td>
            </tr>
          ))}
          {shown.length < parts.length && (
            <tr className="border-t text-[12px] text-muted-foreground">
              <td />
              <td className="px-3 py-1.5" colSpan={2}>
                금액이 0인 {parts.length - shown.length}개 행은 생략
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <td className="px-3 py-2 text-center font-mono text-base">=</td>
            <td className="px-3 py-2">{formula.factor ? `위 값 × ${formula.factor * 100}%` : '계산 결과'}</td>
            <td className={cn('px-3 py-2 text-right tabular-nums', total < 0 && 'text-red-600')} data-slot="drill-total">
              {won(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function DetailView({ detail, cellValue, query, setQuery, exportArgs }: { detail: DrillDetail; cellValue: number; query: string; setQuery: (v: string) => void; exportArgs: { year: number; months: number[]; key: string; title: string } }) {
  const q = query.trim().toLowerCase()
  const match = (...texts: (string | null)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q))
  const ok = Math.abs(detail.total - cellValue) < 1
  const dealRows = detail.kind === 'deals' ? detail.rows.filter((r) => match(r.dealCode, r.issuer, r.supplier, r.itemName, r.owner)) : []
  const expenseRows = detail.kind === 'expenses' ? detail.rows.filter((r) => match(r.itemName, r.counterparty, r.date)) : []
  const shownTotal = sumAmounts((detail.kind === 'deals' ? dealRows : expenseRows).map((r) => r.amount))
  const count = detail.kind === 'deals' ? dealRows.length : expenseRows.length
  const th = 'px-2.5 py-2 text-left font-semibold whitespace-nowrap'
  const td = 'px-2.5 py-1.5 align-top'

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <Input aria-label="내역 검색" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="거래코드·거래처·품목으로 찾기" className="h-8 w-64" />
        <span className="text-muted-foreground">
          {detail.rows.length.toLocaleString()}건{q ? ` 중 ${count.toLocaleString()}건` : ''}
        </span>
        {/* 창 안에서 바로 엑셀로 (2026-10-08 요청) */}
        <XlsxExportButton action={exportReportCellXlsx} filters={exportArgs} label="엑셀" />
        <span
          data-slot="drill-check"
          data-ok={ok || undefined}
          className={cn('ml-auto rounded-full px-2.5 py-1 font-medium', ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}
        >
          {ok ? `내역 합계 ₩ ${won(detail.total)} = 표의 값` : `내역 합계 ₩ ${won(detail.total)} ≠ 표의 값 ₩ ${won(cellValue)} — 새로고침 후 다시 확인해 주세요`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border">
        {detail.kind === 'deals' ? (
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[12px] text-slate-700">
              <tr>
                <th className={th}>거래코드</th>
                <th className={th}>귀속</th>
                <th className={th}>담당</th>
                <th className={th}>발행처</th>
                <th className={th}>매체사</th>
                <th className={th}>품목명</th>
                <th className={th}>{detail.dateLabel}</th>
                <th className={th}>{detail.labels?.status ?? (detail.side === 'sales' ? '입금' : '결산')}</th>
                <th className={cn(th, 'text-right')}>{detail.labels?.net ?? (detail.side === 'sales' ? '매출금' : '매입금')}</th>
                <th className={cn(th, 'text-right')}>{detail.labels?.vat ?? '부가세'}</th>
                <th className={cn(th, 'bg-slate-200 text-right')}>{detail.labels?.amount ?? (detail.side === 'sales' ? '총매출' : '총매입')}</th>
              </tr>
            </thead>
            <tbody>
              {dealRows.map((r) => (
                <tr key={r.id} className="border-t odd:bg-white even:bg-slate-50/70 hover:bg-sky-50">
                  <td className={cn(td, 'whitespace-nowrap')}>
                    <Link href={`/deals/${r.id}`} target="_blank" className="inline-flex items-center gap-1 font-medium text-sky-800 underline underline-offset-4">
                      {r.dealCode}
                      <ExternalLink className="size-3" />
                    </Link>
                  </td>
                  <td className={cn(td, 'whitespace-nowrap tabular-nums text-slate-600')}>{r.accrual}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>{r.owner ?? '-'}</td>
                  <td className={td}>{r.issuer ?? '-'}</td>
                  <td className={td}>{r.supplier ?? '-'}</td>
                  <td className={cn(td, 'max-w-64')}>{r.itemName ?? '-'}</td>
                  <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{r.basisDate ?? '-'}</td>
                  <td className={cn(td, 'whitespace-nowrap', r.status === 'completed' ? 'text-emerald-700' : 'text-red-600')}>{r.status === 'completed' ? '완료' : '미완료'}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{won(r.net)}</td>
                  <td className={cn(td, 'text-right tabular-nums text-slate-600')}>{won(r.vat)}</td>
                  <td className={cn(td, 'bg-slate-100/70 text-right font-semibold tabular-nums', r.amount < 0 && 'text-red-600')}>{won(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-200 font-semibold">
              <tr>
                <td className="px-2.5 py-2" colSpan={10}>
                  {q ? '검색된 내역 합계' : '합계'}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums" data-slot="drill-total">
                  {won(shownTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[12px] text-slate-700">
              <tr>
                <th className={th}>지출일</th>
                <th className={th}>품목</th>
                <th className={th}>거래처</th>
                <th className={th}>항목</th>
                <th className={cn(th, 'bg-slate-200 text-right')}>금액</th>
              </tr>
            </thead>
            <tbody>
              {expenseRows.map((r) => (
                <tr key={r.id} className="border-t odd:bg-white even:bg-slate-50/70 hover:bg-sky-50">
                  <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{r.date}</td>
                  <td className={td}>{r.itemName ?? '-'}</td>
                  <td className={td}>{r.counterparty ?? '-'}</td>
                  <td className={cn(td, 'whitespace-nowrap')}>{r.category ?? '-'}</td>
                  <td className={cn(td, 'bg-slate-100/70 text-right font-semibold tabular-nums')}>{won(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-200 font-semibold">
              <tr>
                <td className="px-2.5 py-2" colSpan={4}>
                  {q ? '검색된 내역 합계' : '합계'}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums" data-slot="drill-total">
                  {won(shownTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        {count === 0 && <div className="py-10 text-center text-sm text-muted-foreground">해당하는 내역이 없습니다</div>}
      </div>
    </>
  )
}
