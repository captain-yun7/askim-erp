'use server'

import * as XLSX from 'xlsx'
import { getSessionUser, canAccessBackoffice } from '@/server/auth/guards'
import { buildLedgerLines, getSalesLedger } from '@/server/queries/reports-ledger'
import { getMonthlyCollection } from '@/server/queries/reports-collection'
import { getPlanReport } from '@/server/queries/reports-plan'
import { getMonthlyPnl } from '@/server/queries/reports-pnl'
import { getTopCounterparties, type TopSort } from '@/server/queries/reports-top'
import { getDonations } from '@/server/queries/reports-donations'
import { sumAmounts, getSalesAnalysis } from '@/server/queries/reports-analysis'
import { audit } from '@/server/audit'

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
  const note: Cell[][] = [[`${year}년 매출장표 · 총매출·매출원가·손익 VAT 포함 (엑셀 매출장표와 동일) · 통장=입금·지급일, 귀속월=발생주의`], []]
  const filename = `매출장표_${year}.xlsx`
  await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename}` })
  return { ok: true, filename, base64: toXlsx([{ name: '매출장표', rows: [...note, header, ...rows], widths: [22, ...Array(15).fill(14)] }]) }
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
  const filename = `월별수금결산_${year}.xlsx`
  await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename}` })
  return { ok: true, filename, base64: toXlsx([{ name: '월별 수금결산', rows, widths: [8, ...Array(8).fill(15)] }]) }
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
  const filename = `매출목표_현금흐름_${year}.xlsx`
  await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename}` })
  return { ok: true, filename, base64: toXlsx([{ name: '매출목표', rows: target, widths: [16, 8, 15, 8, 15, 8, 15, 8, 30] }, { name: '현금흐름', rows: cash, widths: [18, 24, 16, 14, 6] }]) }
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
  const filename = `월별손익_${year}.xlsx`
  await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename}` })
  return { ok: true, filename, base64: toXlsx([{ name: '월별 손익', rows: data, widths: [8, 15, 15, 15, 15] }]) }
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
  const filename = `TOP거래처_${year}.xlsx`
  await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename}` })
  return { ok: true, filename, base64: toXlsx([{ name: 'TOP 거래처', rows: data, widths: [6, 30, 16, 16, 8] }]) }
}

export async function exportDonationsXlsx({ year }: { year: number }): Promise<XlsxResult> {
  const g = await guard()
  if (g) return g
  const { months, total, count } = await getDonations({ year })
  const summary: Cell[][] = [[`${year}년 기부금 월별 합계`], [], ['월', '건수', '합계'], ...months.map((m) => [`${m.month}월`, m.rows.length, r0(m.total)]), ['연간', count, r0(total)]]
  const detail: Cell[][] = [['월', '지출일', '사용처', '품목', '수단', '금액'], ...months.flatMap((m) => m.rows.map((r) => [`${m.month}월`, r.expenseDate, r.counterpartyText ?? '', r.itemName ?? '', r.paymentMethod, r0(r.amount)]))]
  const filename = `기부금_${year}.xlsx`
  await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename}` })
  return { ok: true, filename, base64: toXlsx([{ name: '월별 합계', rows: summary, widths: [8, 8, 16] }, { name: '사용내역', rows: detail, widths: [6, 12, 28, 28, 12, 14] }]) }
}

/** 매출분석보고서 — 표 6개를 시트별로 (2026-09-28) */
export async function exportSalesAnalysisXlsx({ year, month }: { year: number; month: number | null }): Promise<XlsxResult> {
  const g = await guard()
  if (g) return g
  const a = await getSalesAnalysis({ year, month })
  const period = a.month ? `${year}. ${a.month}월` : `${year}년 전체`
  const pct = (v: number) => Math.round(v * 1000) / 1000
  const share = (title: string, head: string, amountHead: string, rows: { label: string; amount: number; ratio: number }[]): Cell[][] => [
    [`${period} ${title}`],
    [],
    [head, amountHead, '비율'],
    ...rows.map((r) => [r.label, r0(r.amount), pct(r.ratio)]),
    ['총합계', r0(sumAmounts(rows.map((r) => r.amount))), rows.length ? 1 : 0],
  ]
  const clients: Cell[][] = [
    [`${period} 매출 거래처 분석 (귀속월 기준)`],
    [],
    ['매출거래처', '거래처 구분', '매출금액(VAT포함)', '비율'],
    ...a.byClient.map((r) => [r.label, r.clientTypeLabel, r0(r.amount), pct(r.ratio)]),
    ['총합계', '', r0(a.salesTotal), a.byClient.length ? 1 : 0],
  ]
  const cumulative: Cell[][] = [[`${year} 누적매출/매출이익 (현 시점 기준, VAT 제외)`], []]
  for (const grp of a.cumulative.groups) {
    cumulative.push([`<${grp.title}>`], ['담당자', '누적 매출액(VAT제외)', '누적 손익', '손익율'])
    for (const r of grp.rows) cumulative.push([r.owner, r0(r.sales), r0(r.profit), r.margin === null ? null : pct(r.margin)])
    if (grp.rows.length > 1) cumulative.push(['총합계', r0(grp.total.sales), r0(grp.total.profit), grp.total.margin === null ? null : pct(grp.total.margin)])
    cumulative.push([])
  }
  const filename = `매출분석보고서_${year}${a.month ? `-${String(a.month).padStart(2, '0')}` : ''}.xlsx`
  await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename}` })
  return {
    ok: true,
    filename,
    base64: toXlsx([
      { name: '1.매출거래처', rows: clients, widths: [32, 14, 20, 8] },
      { name: '2.산업군', rows: share('매출 산업군 분석', '구분', '매출금액(VAT포함)', a.byClientType), widths: [20, 20, 8] },
      { name: '3.상품(매체)', rows: share('매출 상품(매체) 분석', '구분', '매출금액(VAT포함)', a.byCategory), widths: [22, 20, 8] },
      { name: '4.영업사원', rows: share('영업사원 별 매출액 (귀속월)', '담당자', '매출금액(VAT포함)', a.byOwner), widths: [18, 20, 8] },
      { name: '5.매입거래처', rows: share('매입 거래처 분석 (귀속월 기준)', '매입거래처', '매입금액(VAT포함)', a.bySupplier), widths: [32, 20, 8] },
      { name: '6.누적', rows: cumulative, widths: [18, 22, 18, 10] },
    ]),
  }
}
