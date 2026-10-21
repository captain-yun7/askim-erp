import * as XLSX from 'xlsx'

export type XlsxCell = string | number | null
export type XlsxSheet = { name: string; rows: XlsxCell[][]; widths?: number[] }

/** 시트 → xlsx base64 (서버 액션이 돌려주면 클라이언트에서 저장) */
export function toXlsx(sheets: XlsxSheet[]): string {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows)
    if (s.widths) ws['!cols'] = s.widths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64')
}
