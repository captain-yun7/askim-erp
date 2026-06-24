const BOM = '﻿'

/** CSV 인젝션 방지: =, +, -, @ 로 시작하는 셀은 작은따옴표 prefix */
function sanitize(cell: string): string {
  if (cell.length > 0 && /^[=+\-@]/.test(cell)) {
    return `'${cell}`
  }
  return cell
}

/** 쉼표/따옴표/개행 포함 셀은 큰따옴표로 감싸고 내부 따옴표는 이스케이프 */
function escapeCell(value: string | number | null): string {
  const raw = value === null || value === undefined ? '' : String(value)
  const safe = sanitize(raw)
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

/** 순수 함수: BOM 포함 CSV 문자열 생성 */
export function toCsv(
  headers: string[],
  rows: (string | number | null)[][],
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  return BOM + lines.join('\r\n')
}
