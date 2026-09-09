/**
 * 엑셀 파싱 공통 (scripts/import-* 와 앱 내 업로드가 함께 사용)
 */
import * as XLSX from 'xlsx'

/** TRIM + 공백 정규화 + 빈문자열 → null */
export function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/\t/g, '').replace(/\s+/g, ' ')
  return s === '' || s === '-' ? null : s
}

/** 엑셀 날짜 셀 → ISO date string (YYYY-MM-DD) or null */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v === '-') return null

  // Excel serial number
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y.toString().padStart(4, '0')}-${d.m.toString().padStart(2, '0')}-${d.d.toString().padStart(2, '0')}`
  }

  // Date object (xlsx with cellDates: true)
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = (v.getMonth() + 1).toString().padStart(2, '0')
    const d = v.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // String
  const s = String(v).trim()
  if (s === '' || s === '-') return null

  // ISO 형식 (2024-01-15, 2024-01-15 00:00:00)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  }

  // '3월' 같은 텍스트는 null (별도 메모로 보존하는 책임은 호출자)
  return null
}

/** 수치 셀 → number or null (음수도 허용) */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).trim().replace(/,/g, '')
  if (s === '' || s === '-') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

/** 거래항목 텍스트 → expense_category code 매핑 */
export const EXPENSE_CAT_MAP: Record<string, string> = {
  '식대비': 'meals',
  '교통비': 'transport',
  '지급수수료': 'commission_fee',
  '복리후생비': 'welfare',
  '기부금': 'donation',
  '도서인쇄비': 'books_print',
  '출장비': 'travel',
  '마케팅비': 'marketing',
  '사무용품비': 'office_supplies',
  '접대비': 'entertainment',
  '외부인건비': 'external_labor',
  '우편요금': 'postage',
  '외주용역비': 'outsourcing',
  '운반비': 'cargo',
  '교육비': 'education',
  '인건비': 'labor',
  '인건비/4대보험료': 'labor',
  '4대보험료': 'labor',
  '일반소모품비': 'general_supplies',
  '주유비': 'fuel',
  '차량유지비': 'vehicle',
  '차량운반구': 'vehicle_asset',
  '보험비': 'insurance',
  '기타운영비': 'other_ops',
  '세금': 'tax',
  '지급임차료': 'office_rent',
  '건물관리비': 'utility',
  '통신비': 'communication',
  '대출이자': 'loan_interest',
}

/** '(식대비)' / '(교' / '식대비' 등을 정규화해서 code로 매핑 */
export function mapExpenseCategory(raw: unknown): string {
  const s = cleanText(raw)
  if (!s) return 'other_var'
  // 괄호 제거
  const inner = s.replace(/^[(\(]/, '').replace(/[)\)]$/, '')
  // 정확 매칭
  if (EXPENSE_CAT_MAP[inner]) return EXPENSE_CAT_MAP[inner]
  // prefix 매칭 ('(교' → 교통비)
  for (const [ko, code] of Object.entries(EXPENSE_CAT_MAP)) {
    if (ko.startsWith(inner) && inner.length >= 1) return code
  }
  return 'other_var'
}

