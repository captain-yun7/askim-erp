import * as XLSX from 'xlsx'
import { cleanText, mapExpenseCategory, parseDate, parseNumber } from './excel-import'

/**
 * 판관비 엑셀 업로드 파싱 (2026-09-09 피드백 — 고객 '판관비 업로드 양식.xlsx')
 * 헤더 행: No. | 연도 | 월 | 지출일 | 품목 | 합계 | 거래처 | 거래항목  (헤더 위치는 이름으로 탐지)
 */

export type UploadRow = {
  rowNo: number
  expenseDate: string
  itemName: string | null
  amount: number
  counterpartyText: string | null
  categoryRaw: string | null
  /** expense_category.code (매핑 실패 시 other_var) */
  categoryCode: string
}

export type UploadIssue = { rowNo: number; reason: string }

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['지출일', '처리일', '일자', '날짜'],
  item: ['품목', '내용', '적요'],
  amount: ['합계', '금액'],
  counterparty: ['거래처', '상호', '가맹점'],
  category: ['거래항목', '항목', '계정과목', '카테고리'],
}

function findHeader(rows: unknown[][]): { idx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map((c) => (cleanText(c) ?? '').replace(/\s/g, ''))
    const cols: Record<string, number> = {}
    for (const [key, names] of Object.entries(HEADER_ALIASES)) {
      const at = cells.findIndex((c) => names.includes(c))
      if (at >= 0) cols[key] = at
    }
    if (cols.date != null && cols.amount != null) return { idx: i, cols }
  }
  return null
}

export function parseExpenseWorkbook(buf: ArrayBuffer | Buffer): { rows: UploadRow[]; issues: UploadIssue[]; sheet: string } {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  // 헤더가 잡히는 첫 시트 사용
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]
    const header = findHeader(grid)
    if (!header) continue
    const { idx, cols } = header
    const rows: UploadRow[] = []
    const issues: UploadIssue[] = []
    for (let i = idx + 1; i < grid.length; i++) {
      const r = grid[i]
      if (!r || r.every((c) => c == null || String(c).trim() === '')) continue
      const rowNo = i + 1
      const expenseDate = parseDate(r[cols.date])
      const amount = parseNumber(r[cols.amount])
      if (!expenseDate && amount == null) continue // 합계·메모 행 등
      if (!expenseDate) {
        issues.push({ rowNo, reason: `지출일 없음/형식 오류 (${cleanText(r[cols.date]) ?? '빈칸'})` })
        continue
      }
      if (amount == null || amount === 0) {
        issues.push({ rowNo, reason: '금액 없음' })
        continue
      }
      const categoryRaw = cols.category != null ? cleanText(r[cols.category]) : null
      rows.push({
        rowNo,
        expenseDate,
        itemName: cols.item != null ? cleanText(r[cols.item]) : null,
        amount,
        counterpartyText: cols.counterparty != null ? cleanText(r[cols.counterparty]) : null,
        categoryRaw,
        categoryCode: mapExpenseCategory(categoryRaw),
      })
    }
    return { rows, issues, sheet: name }
  }
  throw new Error('헤더(지출일·합계)를 찾지 못했습니다. 양식 파일을 내려받아 같은 형식으로 작성해 주세요.')
}

/** 중복 판정 키 — 같은 날짜·금액·품목·거래처 */
export const dupKey = (r: { expenseDate: string; amount: number | string; itemName: string | null; counterpartyText: string | null }) =>
  `${r.expenseDate}|${Math.round(Number(r.amount))}|${r.itemName ?? ''}|${r.counterpartyText ?? ''}`
