'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveCashBalances } from '@/server/actions/plan'

type Row = { id: number | null; label: string; amountKrw: string; amountFx: string; fxCurrency: string }

const CURRENCIES = ['KRW', 'USD', 'CNY'] as const

export function CashBalanceEditor({
  year,
  asOf,
  fxRateUsd,
  rows,
  onDone,
}: {
  year: number
  asOf: string | null
  fxRateUsd: number | null
  rows: { id: number; label: string; amountKrw: number; amountFx: number | null; fxCurrency: string | null }[]
  onDone: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [date, setDate] = useState(asOf ?? new Date().toISOString().slice(0, 10))
  const [fx, setFx] = useState(fxRateUsd != null ? String(fxRateUsd) : '')
  const [fxLoading, setFxLoading] = useState(false)
  // 통화별 오늘 환율 캐시 (CNY 등 USD 외 통화 자동계산용)
  const ratesRef = useRef<Record<string, number>>({})
  const [state, setState] = useState<Row[]>(
    rows.map((r) => ({
      id: r.id,
      label: r.label,
      amountKrw: String(r.amountKrw || ''),
      amountFx: r.amountFx != null ? String(r.amountFx) : '',
      // 외화값 없이 저장된 기존 행은 원화 계좌로 취급 (2026-09-01 피드백: 기본 KRW)
      fxCurrency: r.fxCurrency ?? (r.amountFx != null ? 'USD' : 'KRW'),
    })),
  )

  function set(i: number, patch: Partial<Row>) {
    setState((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const n = (v: string) => Number(v.replace(/,/g, ''))

  async function rateFor(currency: string): Promise<number | null> {
    if (currency === 'USD' && fx) return n(fx)
    if (ratesRef.current[currency]) return ratesRef.current[currency]
    try {
      const res = await fetch(`/api/fx-rate?base=${currency}`)
      const data = await res.json()
      if (!res.ok || !data.krw) throw new Error()
      ratesRef.current[currency] = data.krw
      if (currency === 'USD' && !fx) setFx(String(data.krw))
      return data.krw
    } catch {
      return null
    }
  }

  /** 외화 금액 확정 시 KRW 자동계산 (2026-09-01 피드백) — 계산 후에도 KRW 칸 수기 수정 가능 */
  async function fillKrwFromFx(i: number) {
    const row = state[i]
    if (row.fxCurrency === 'KRW' || !row.amountFx) return
    const amount = n(row.amountFx)
    if (!Number.isFinite(amount) || !amount) return
    const rate = await rateFor(row.fxCurrency)
    if (rate == null) {
      toast.error(`${row.fxCurrency} 환율 조회 실패 — KRW 금액을 직접 입력해 주세요`)
      return
    }
    set(i, { amountKrw: String(Math.round(amount * rate)) })
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await saveCashBalances({
            year,
            cashAsOf: date || null,
            fxRateUsd: fx ? n(fx) : null,
            rows: state.map((r) => ({
              id: r.id,
              label: r.label,
              amountKrw: n(r.amountKrw) || 0,
              amountFx: r.fxCurrency !== 'KRW' && r.amountFx ? n(r.amountFx) : null,
              fxCurrency: r.fxCurrency !== 'KRW' ? r.fxCurrency : null,
            })),
          })
          if ('error' in res) toast.error(res.error)
          else {
            toast.success('계좌 잔액 저장')
            onDone()
            router.refresh()
          }
        })
      }}
    >
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">기준일</span>
          <Input type="date" className="h-8 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">적용환율 (USD)</span>
          <Input
            className="h-8 w-28 text-right font-mono"
            inputMode="decimal"
            value={fx}
            onChange={(e) => setFx(e.target.value)}
            placeholder="1,418.40"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={fxLoading}
          onClick={async () => {
            setFxLoading(true)
            try {
              const res = await fetch('/api/fx-rate?base=USD')
              const data = await res.json()
              if (!res.ok || !data.krw) throw new Error(data.error)
              setFx(String(data.krw))
              ratesRef.current.USD = data.krw
              toast.success(`오늘 환율 ${data.krw.toLocaleString()}원 적용`)
            } catch {
              toast.error('환율 조회 실패 — 수기로 입력해 주세요')
            } finally {
              setFxLoading(false)
            }
          }}
        >
          <RefreshCw className={fxLoading ? 'size-3.5 animate-spin' : 'size-3.5'} />
          오늘 환율
        </Button>
      </div>

      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b text-[12px] text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">계좌</th>
            <th className="w-24 px-2 py-1.5 text-left font-medium">통화</th>
            <th className="w-36 px-2 py-1.5 text-right font-medium">외화 금액</th>
            <th className="w-44 px-2 py-1.5 text-right font-medium">금액 (KRW, VAT 포함)</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {state.map((r, i) => (
            <tr key={r.id ?? `new-${i}`} className="border-b last:border-0">
              <td className="px-2 py-1.5">
                <Input className="h-8" value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
              </td>
              <td className="px-2 py-1.5">
                <select
                  className="h-8 w-full rounded-lg border bg-background px-2 text-[12.5px]"
                  value={r.fxCurrency}
                  onChange={(e) => {
                    const currency = e.target.value
                    set(i, { fxCurrency: currency, ...(currency === 'KRW' ? { amountFx: '' } : {}) })
                  }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1.5">
                <Input
                  className="h-8 text-right font-mono tabular-nums disabled:bg-muted/50"
                  inputMode="decimal"
                  disabled={r.fxCurrency === 'KRW'}
                  placeholder={r.fxCurrency === 'KRW' ? '' : '외화 입력 → KRW 자동'}
                  value={r.amountFx}
                  onChange={(e) => set(i, { amountFx: e.target.value })}
                  onBlur={() => fillKrwFromFx(i)}
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  className="h-8 text-right font-mono tabular-nums"
                  inputMode="numeric"
                  value={r.amountKrw}
                  onChange={(e) => set(i, { amountKrw: e.target.value })}
                />
              </td>
              <td className="px-1 py-1.5 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  onClick={() => setState((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() =>
            setState((p) => [...p, { id: null, label: '', amountKrw: '', amountFx: '', fxCurrency: 'KRW' }])
          }
        >
          <Plus className="size-3.5" />
          계좌 추가
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            취소
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            저장
          </Button>
        </div>
      </div>
    </form>
  )
}
