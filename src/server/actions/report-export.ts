'use server'

import * as XLSX from 'xlsx'
import { getSessionUser, canAccessBackoffice } from '@/server/auth/guards'
import { buildLedgerLines, getSalesLedger } from '@/server/queries/reports-ledger'
import { getMonthlyCollection } from '@/server/queries/reports-collection'
import { getPlanReport } from '@/server/queries/reports-plan'
import { getMonthlyPnl } from '@/server/queries/reports-pnl'
import { getTopCounterparties, type TopSort } from '@/server/queries/reports-top'
import { getDonations } from '@/server/queries/reports-donations'

/** 리포트 엑셀(xlsx) 다운로드 (2026-09-09 피드백) — base64 로 전달, 클라이언트에서 저장 */
export type XlsxResult = { ok: true; filename: string; base64: string } | { error: string }

type Cell = string | number | null
type Sheet = { name: string; rows: Cell[][]; widths?: number[] }

function toXlsx(sheets: Sheet[]): string {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows)
    if (s.widths) ws['!cols'] = s.widths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64')
}

async function guard(): Promise<{ error: string } | null> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canAccessBackoffice(user.role)) return { error: '권한이 없습니다' }
  return null
}

const r0 = (v: number) => Math.round(v)
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`)

export async function exportLedgerXlsx({ year }: { year: number }): Promise<XlsxResult> {
  const g = await guard()
  if (g) return g
  const lines = buildLedgerLines(await getSalesLedger({ year }))
  const header: Cell[] = ['항목', ...MONTHS, '상반기', '하반기', '연간']
  const sum = (v: number[], a: number, b: number) => r0(v.slice(a, b).reduce((x, y) => x + y, 0))
  const rows: Cell[][] = lines.map((ln) => [
    (ln.level === 1 ? '  ' : ln.level === 2 ? '    ' : '') + ln.label,
    ...ln.values.map(r0),
    sum(ln.values, 0, 6),
    sum(ln.values, 6, 12),
    sum(ln.values, 0, 12),
  ])
  const note: Cell[][] = [[`${year}년 매출장표 · 총매출·매출원가 VAT 포함, 손익·영업이익·당기순이익 공급가 기준 · 통장=입금·지급일, 귀속월=발생주의`], []]
  return { ok: true, filename: `매출장표_${year}.xlsx`, base64: toXlsx([{ name: '매출장표', rows: [...note, header, ...rows], widths: [22, ...Array(15).fill(14)] }]) }
}

export async function exportCollectionXlsx({ year }: { year: number }): Promise<XlsxResult> {
  const g = await guard()
  if (g) return g
  const rep = await getMonthlyCollection({ year })
  const rows: Cell[][] = [
    [`${year}년 월별 수금결산`],
    [],
    ['월', '매출 예정', '매출 수금', '매출 미수', '매입 예정', '매입 결산', '매입 미결산', '예상손익(예정)', '손익(수금-결산)'],
    ...rep.months.map((m) => [
      `${m.month}월`, r0(m.salesPlanned), r0(m.salesCollected), r0(m.salesOutstanding), r0(m.purchasePlanned), r0(m.purchaseSettled), r0(m.purchaseOutstanding),
      r0(m.salesPlanned - m.purchasePlanned), r0(m.salesCollected - m.purchaseSettled),
    ]),
    ['합계', r0(rep.total.salesPlanned), r0(rep.total.salesCollected), r0(rep.total.salesOutstanding), r0(rep.total.purchasePlanned), r0(rep.total.purchaseSettled), r0(rep.total.purchaseOutstanding),
      r0(rep.total.salesPlanned - rep.total.purchasePlanned), r0(rep.total.salesCollected - rep.total.purchaseSettled)],
  ]
  return { ok: true, filename: `월별수금결산_${year}.xlsx`, base64: toXlsx([{ name: '월별 수금결산', rows, widths: [8, ...Array(8).fill(15)] }]) }
}

export async function exportPlanXlsx({ year }: { year: number }): Promise<XlsxResult> {
  const g = await guard()
  if (g) return g
  const rep = await getPlanReport({ year })
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null)
  const target: Cell[][] = [
    [`${year}년 매출목표`],
    [],
    ['구분', '우선순위', '매출목표', '목표 %', '달성치', '달성 %', '수익', '수익률 %', '상품구분'],
    ...rep.groups.map((gr) => [gr.label, gr.priority ?? '', r0(gr.target), pct(gr.target, rep.totals.target), r0(gr.achieved), pct(gr.achieved, gr.target), r0(gr.profit), pct(gr.profit, gr.achieved), gr.categories.join(', ')]),
    ['합계', '', r0(rep.totals.target), 100, r0(rep.totals.achieved), pct(rep.totals.achieved, rep.totals.target), r0(rep.totals.profit), pct(rep.totals.profit, rep.totals.achieved), ''],
    ['목표군 미지정', '', '', '', r0(rep.unmapped.achieved), '', r0(rep.unmapped.profit), '', rep.unmapped.categories.join(', ')],
  ]
  const cash: Cell[][] = [
    [`현금흐름 (기준일 ${rep.cash.asOf ?? '-'} · USD 환율 ${rep.cash.fxRateUsd ?? '-'})`],
    [],
    ['구분', '내용', '금액(KRW)', '외화', '통화'],
    ...rep.cash.rows.map((c) => ['계좌 잔액', c.label, r0(c.amountKrw), c.amountFx ?? '', c.fxCurrency ?? '']),
    ['계좌 잔액 합계', '', r0(rep.cash.balanceTotal), '', ''],
    ['미수금(입금 예정)', '', r0(rep.cash.futureSales), '', ''],
    ['미지급(결산 예정)', '', r0(rep.cash.futurePurchase), '', ''],
    ['예상 현금', '', r0(rep.cash.balanceTotal + rep.cash.futureSales - rep.cash.futurePurchase), '', ''],
  ]
  return { ok: true, filename: `매출목표_현금흐름_${year}.xlsx`, base64: toXlsx([{ name: '매출목표', rows: target, widths: [16, 8, 15, 8, 15, 8, 15, 8, 30] }, { name: '현금흐름', rows: cash, widths: [18, 24, 16, 14, 6] }]) }
}

export async function exportPnlXlsx({ year }: { year: number }): Promise<XlsxResult> {
  const g = await guard()
  if (g) return g
  const { rows, total } = await getMonthlyPnl({ year })
  const data: Cell[][] = [
    [`${year}년 월별 손익 (귀속월 기준)`],
    [],
    ['월', '매출총이익', '판관비', '영업이익', '십일조'],
    ...rows.map((r) => [`${r.month}월`, r0(r.grossProfit), r0(r.expense), r0(r.operatingProfit), r0(r.tithe)]),
    ['합계', r0(total.grossProfit), r0(total.expense), r0(total.operatingProfit), r0(total.tithe)],
  ]
  return { ok: true, filename: `월별손익_${year}.xlsx`, base64: toXlsx([{ name: '월별 손익', rows: data, widths: [8, 15, 15, 15, 15] }]) }
}

export async function exportTopXlsx({ year, sort }: { year: number; sort: TopSort }): Promise<XlsxResult> {
  const g = await guard()
  if (g) return g
  const rows = await getTopCounterparties({ year, sort, limit: 100 })
  const data: Cell[][] = [
    [`${year}년 TOP 거래처 (VAT포함) · ${sort === 'profit' ? '손익순' : '매출순'}`],
    [],
    ['순위', '거래처', '매출(VAT 포함)', '손익(공급가)', '건수'],
    ...rows.map((r, i) => [i + 1, r.name, r0(r.sales), r0(r.profit), r.count]),
  ]
  return { ok: true, filename: `TOP거래처_${year}.xlsx`, base64: toXlsx([{ name: 'TOP 거래처', rows: data, widths: [6, 30, 16, 16, 8] }]) }
}

export async function exportDonationsXlsx({ year }: { year: number }): Promise<XlsxResult> {
  const g = await guard()
  if (g) return g
  const { months, total, count } = await getDonations({ year })
  const summary: Cell[][] = [[`${year}년 기부금 월별 합계`], [], ['월', '건수', '합계'], ...months.map((m) => [`${m.month}월`, m.rows.length, r0(m.total)]), ['연간', count, r0(total)]]
  const detail: Cell[][] = [['월', '지출일', '사용처', '품목', '수단', '금액'], ...months.flatMap((m) => m.rows.map((r) => [`${m.month}월`, r.expenseDate, r.counterpartyText ?? '', r.itemName ?? '', r.paymentMethod, r0(r.amount)]))]
  return { ok: true, filename: `기부금_${year}.xlsx`, base64: toXlsx([{ name: '월별 합계', rows: summary, widths: [8, 8, 16] }, { name: '사용내역', rows: detail, widths: [6, 12, 28, 28, 12, 14] }]) }
}
