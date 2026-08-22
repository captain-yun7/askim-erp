'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatKRW as formatRaw } from '@/lib/format'
import type { PlanReport } from '@/server/queries/reports-plan'
import { SalesTargetEditor } from './sales-target-editor'
import { CashBalanceEditor } from './cash-balance-editor'

const formatKRW = (v: number) => formatRaw(Math.round(v))

const cell = 'whitespace-nowrap px-3 py-2 text-right tabular-nums'
const pct = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(2)}%` : '-')
const pct0 = (v: number, base: number) => (base ? `${Math.round((v / base) * 100)}%` : '-')

const PRIORITY_TONE: Record<string, string> = {
  상: 'bg-primary text-primary-foreground',
  중: 'bg-muted text-foreground',
  하: 'bg-muted text-muted-foreground',
}

function heat(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return ''
  if (ratio >= 0.4) return 'bg-muted'
  if (ratio >= 0.25) return 'bg-muted/50'
  return ''
}

export function SalesTargetSection({ report, editable }: { report: PlanReport; editable: boolean }) {
  const [editing, setEditing] = useState(false)
  const { groups, totals, unmapped, year } = report

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-[13px] font-medium">{year} 매출 달성률</div>
          <div className="text-[11.5px] text-muted-foreground">VAT 제외 · 귀속연도 기준 · 상품구분 → 목표군 합산</div>
        </div>
        {editable && !editing && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            목표 수정
          </Button>
        )}
      </div>

      {editing ? (
        <div className="p-4">
          <SalesTargetEditor
            year={year}
            rows={groups.map((g) => ({ code: g.code, label: g.label, priority: g.priority, target: g.target }))}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12.5px]">
            <thead>
              <tr className="border-b bg-muted/40 text-[12px] text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">구분</th>
                <th className="px-3 py-2 text-center font-medium">우선순위</th>
                <th className="px-3 py-2 text-right font-medium">매출목표</th>
                <th className="px-3 py-2 text-right font-medium">목표 %</th>
                <th className="px-3 py-2 text-right font-medium">달성 %</th>
                <th className="px-3 py-2 text-right font-medium">달성치</th>
                <th className="px-3 py-2 text-right font-medium">수익</th>
                <th className="px-3 py-2 text-right font-medium">수익률</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const margin = g.achieved ? g.profit / g.achieved : 0
                return (
                  <tr key={g.code} className="border-b">
                    <td className="px-4 py-2">
                      <div className="font-medium">{g.label}</div>
                      {g.categories.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">{g.categories.join(' + ')}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {g.priority ? (
                        <span
                          className={cn(
                            'inline-flex rounded px-2 py-0.5 text-[11px] font-medium',
                            PRIORITY_TONE[g.priority],
                          )}
                        >
                          {g.priority}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className={cell}>{formatKRW(g.target)}</td>
                    <td className={cn(cell, heat(totals.target ? g.target / totals.target : 0))}>
                      {pct0(g.target, totals.target)}
                    </td>
                    <td className={cell}>{pct(g.achieved, g.target)}</td>
                    <td className={cn(cell, 'bg-muted/60')}>{g.achieved ? formatKRW(g.achieved) : '-'}</td>
                    <td className={cn(cell, 'bg-muted/60', g.profit < 0 && 'text-destructive')}>
                      {g.profit ? formatKRW(g.profit) : '-'}
                    </td>
                    <td className={cn(cell, heat(margin), margin < 0 && 'text-destructive')}>
                      {g.achieved ? `${(margin * 100).toFixed(2)}%` : '-'}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-b bg-yellow-50 font-medium">
                <td className="px-4 py-2.5">총 합</td>
                <td />
                <td className={cell}>{formatKRW(totals.target)}</td>
                <td className={cell}>100%</td>
                <td className={cell}>{pct0(totals.achieved, totals.target)}</td>
                <td className={cell}>{formatKRW(totals.achieved)}</td>
                <td className={cn(cell, totals.profit < 0 && 'text-destructive')}>{formatKRW(totals.profit)}</td>
                <td className={cell}>{totals.achieved ? `${((totals.profit / totals.achieved) * 100).toFixed(2)}%` : '-'}</td>
              </tr>
              {unmapped.achieved !== 0 && (
                <tr className="text-muted-foreground">
                  <td className="px-4 py-2" colSpan={5}>
                    목표군 미지정 ({unmapped.categories.join(', ') || '상품구분 없음'}) — 합계 미포함
                  </td>
                  <td className={cell}>{formatKRW(unmapped.achieved)}</td>
                  <td className={cell}>{formatKRW(unmapped.profit)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function CashFlowSection({ report, editable }: { report: PlanReport; editable: boolean }) {
  const [editing, setEditing] = useState(false)
  const { cash, year } = report
  const futureNet = cash.futureSales - cash.futurePurchase

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-[13px] font-medium">{year} 현금흐름</div>
          <div className="text-[11.5px] text-muted-foreground">
            VAT 포함 · 기준일 {cash.asOf ?? '미설정'}
            {cash.fxRateUsd ? ` · 적용환율 ${formatKRW(cash.fxRateUsd)}` : ''} · 계좌 잔액은 회계담당 수기 입력
          </div>
        </div>
        {editable && !editing && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            잔액 입력
          </Button>
        )}
      </div>

      {editing ? (
        <div className="p-4">
          <CashBalanceEditor
            year={year}
            asOf={cash.asOf}
            fxRateUsd={cash.fxRateUsd}
            rows={cash.rows}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b bg-muted/40 text-[12px] text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">구분</th>
              <th className="px-3 py-2 text-left font-medium">내용</th>
              <th className="px-3 py-2 text-right font-medium">금액</th>
              <th className="px-3 py-2 text-left font-medium">비고</th>
            </tr>
          </thead>
          <tbody>
            {cash.rows.map((r, i) => (
              <tr key={r.id} className="border-b">
                {i === 0 && (
                  <td className="px-4 py-2 align-top font-medium" rowSpan={cash.rows.length}>
                    금액현황
                  </td>
                )}
                <td className="px-3 py-2">{r.label}</td>
                <td className={cn(cell, 'bg-muted/60')}>{formatKRW(r.amountKrw)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.amountFx != null && r.fxCurrency
                    ? `${r.fxCurrency} ${r.amountFx.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    : ''}
                </td>
              </tr>
            ))}
            {cash.rows.length === 0 && (
              <tr className="border-b">
                <td className="px-4 py-3 text-muted-foreground" colSpan={4}>
                  계좌 잔액이 입력되지 않았습니다.
                </td>
              </tr>
            )}
            <tr className="border-b bg-muted font-medium">
              <td className="px-4 py-2" colSpan={2}>합 계(대출제외)</td>
              <td className={cell}>{formatKRW(cash.balanceTotal)}</td>
              <td />
            </tr>
            <tr className="border-b">
              <td className="px-4 py-2" colSpan={2}>업데이트 시점 이후 매출(예정)</td>
              <td className={cn(cell, 'bg-muted/60')}>{formatKRW(cash.futureSales)}</td>
              <td className="px-3 py-2 text-[11.5px] text-muted-foreground">입금 완료 건 제외</td>
            </tr>
            <tr className="border-b">
              <td className="px-4 py-2" colSpan={2}>업데이트 시점 이후 매입(예정)</td>
              <td className={cn(cell, 'bg-muted/60')}>{formatKRW(cash.futurePurchase)}</td>
              <td className="px-3 py-2 text-[11.5px] text-muted-foreground">결산 완료 건 제외</td>
            </tr>
            <tr className="border-b">
              <td className="px-4 py-2" colSpan={2}>업데이트 시점 이후 현금흐름(예정)</td>
              <td className={cn(cell, futureNet < 0 && 'text-destructive')}>{formatKRW(futureNet)}</td>
              <td />
            </tr>
            <tr className="bg-muted font-medium">
              <td className="px-4 py-2.5" colSpan={2}>업데이트 시점 합계 + 미래 현금매출(대출제외)</td>
              <td className={cell}>{formatKRW(cash.balanceTotal + futureNet)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  )
}
