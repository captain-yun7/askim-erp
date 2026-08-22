/**
 * 엑셀 import 공통 유틸리티
 * — 날짜 파싱, 텍스트 정규화, lookup 매칭
 */
import * as XLSX from 'xlsx'

/** 기본 원본 파일 — 환경변수 XLSX_FILE 로 덮어쓸 수 있음 */
export const XLSX_FILE =
  process.env.XLSX_FILE ??
  '2026 에스킴 컴퍼니 거래처 매출·매입 통합프로그램 - 회계용_2026.08.19.xlsx'

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

/** '1월' / '3월' / '23년12월' / 숫자 → month int (1~12) or null */
export function parseMonth(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && v >= 1 && v <= 12) return v
  const s = String(v).trim()
  // '23년12월' 형태 — 끝의 N월 추출
  const m = s.match(/(\d{1,2})월/)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= 12) return n
  }
  const n = parseInt(s, 10)
  if (!isNaN(n) && n >= 1 && n <= 12) return n
  return null
}

/** '2026' / 2026 / "'" → year int or null */
export function parseYear(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && v >= 2000 && v <= 2100) return Math.floor(v)
  const s = String(v).trim()
  // '23년12월' 형태 — 앞의 N년 추출, 23 → 2023
  const yyMatch = s.match(/^(\d{2})년/)
  if (yyMatch) {
    const n = parseInt(yyMatch[1], 10)
    return n < 50 ? 2000 + n : 1900 + n
  }
  const n = parseInt(s, 10)
  if (!isNaN(n) && n >= 2000 && n <= 2100) return n
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

/** 숫자를 string으로 (numeric 컬럼용) */
export function numStr(n: number | null): string | null {
  if (n === null) return null
  return n.toString()
}

/** 사업자번호 정규화: 탭/공백 제거, '-' 유지 */
export function cleanBizNo(v: unknown): string | null {
  const s = cleanText(v)
  if (!s) return null
  // 숫자/하이픈만 남기고 정리
  const cleaned = s.replace(/[^\d-]/g, '')
  // 형식 검증 (3-2-5 또는 10자리 숫자)
  if (/^\d{3}-\d{2}-\d{5}$/.test(cleaned)) return cleaned
  if (/^\d{10}$/.test(cleaned)) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5)}`
  }
  return cleaned || null
}

/** 거래처명 fuzzy 매칭용 정규화 키 */
export function counterpartyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s㈜()()\[\]]+/g, '')
    .replace(/주식회사/g, '')
    .trim()
}

/** 외화 메모에서 통화 추출 ('USD1,575.52입금' → USD) */
export function extractCurrency(memo: string | null): 'USD' | 'CNY' | null {
  if (!memo) return null
  if (/USD\s*[\d,.]+/i.test(memo)) return 'USD'
  if (/CNY|위안|RMB/i.test(memo)) return 'CNY'
  return null
}

/** Workbook 로드 (헬퍼) */
export function loadWorkbook(path: string = XLSX_FILE): XLSX.WorkBook {
  return XLSX.readFile(path, { cellDates: true, cellNF: false, cellText: false })
}

/** 시트를 2D 배열로 (헤더 그대로) */
export function sheetToRows(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`)
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]
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

/** "100-000-424857 (신한)" / "신한은행 100-…" / "110-… 신한 공동주" → { bankName, accountNo } */
export function splitBankAccount(raw: string | null): { bankName: string | null; accountNo: string | null } {
  if (!raw) return { bankName: null, accountNo: null }
  const paren = raw.match(/\(([^)]+)\)/)
  let bankName = paren?.[1]?.trim() ?? null
  if (!bankName && /[0-9]{3,}/.test(raw)) {
    bankName = raw.replace(/\([^)]*\)/g, '').match(/[A-Za-z가-힣]+/)?.[0] ?? null
  }
  const accountNo = raw.match(/[0-9][0-9 -]*[0-9]/)?.[0] ?? raw
  return { bankName, accountNo }
}

/** 계정항목 텍스트 → account code */
export const ACCOUNT_MAP: Record<string, string> = {
  '광고비': 'ad_fee',
  '광고료': 'ad_fee',
  '제작비': 'production_fee',
  '제직비': 'production_fee', // 오타 케이스
  '보증금': 'deposit',
  '계약금': 'contract_advance',
  '선금': 'advance',
  '잔금': 'balance',
}

export function mapAccount(raw: unknown): string {
  const s = cleanText(raw)
  if (!s) return 'ad_fee'
  return ACCOUNT_MAP[s] ?? 'ad_fee'
}

/** 매출수단 텍스트 → sales_method code */
export const SALES_METHOD_MAP: Record<string, string> = {
  '세금계산서': 'tax_invoice',
  '현금영수증': 'cash_receipt',
  '카드결제': 'card',
  '알리페이': 'alipay',
  '계좌이체': 'bank_transfer',
}

export function mapSalesMethod(raw: unknown): string | null {
  const s = cleanText(raw)
  if (!s) return null
  return SALES_METHOD_MAP[s] ?? null
}

/** 상품구분 텍스트 → deal_category code */
export const DEAL_CAT_MAP: Record<string, string> = {
  '외벽/자사(성수)': 'outwall_self_seongsu',
  '외벽/자사(성수 외)': 'outwall_self_other',
  '외벽/공판(성수)': 'outwall_share_seongsu',
  '외벽/공판(성수 외)': 'outwall_share_other',
  '전속/자사': 'exclusive_self',
  '기타/자사': 'etc_self',
  '팬클럽/자사': 'fanclub_self',
  '팬클럽/대행': 'fanclub_agency',
  '팬클럽매체': 'fanclub_self', // 외화시트의 변종
  '팝업': 'popup',
  '해외매체': 'overseas',
  '영업대행': 'sales_agency',
  '매입건': 'purchase_only',
  '협찬/자사': 'sponsorship_self',
  'IP': 'ip',
  '한강버스': 'han_river_bus',
  '중국사업': 'china_biz',
}

export function mapDealCategory(raw: unknown): string {
  const s = cleanText(raw)
  if (!s) return 'etc_self'
  return DEAL_CAT_MAP[s] ?? 'etc_self'
}

/** 담당자 텍스트 → user name */
export const USER_NAME_MAP: Record<string, string> = {
  '김형준': '김형준',
  '최현정': '최현정',
  '이유정': '이유정',
  '박지운': '박지운',
  '강지호': '강지호',
  '오혁': '오혁',
  '유찬영': '유찬영',
  '이명철': '이명철',
  '이나린': '이나린',
  '윤도경': '윤도경',
  '김해준': '김해준',
  '해외영업팀': '해외영업팀',
  '중국사업부': '중국사업부',
}

export function mapUserName(raw: unknown): string | null {
  const s = cleanText(raw)
  if (!s) return null
  return USER_NAME_MAP[s] ?? null
}

/** 입금/결산여부: '완료' → completed, else pending */
export function mapPaidStatus(raw: unknown): 'pending' | 'completed' {
  return cleanText(raw) === '완료' ? 'completed' : 'pending'
}
