import './_env'
import { db } from '../src/lib/db/client'
import {
  account,
  dealCategory,
  expenseCategory,
  salesMethod,
} from '../src/lib/db/schema'

const DEAL_CATEGORIES = [
  { code: 'outwall_self_seongsu',  nameKo: '외벽/자사(성수)',     commissionRate: '0.1000', isOverseas: false, isSpecialShare: null,        displayOrder: 1 },
  { code: 'outwall_self_other',    nameKo: '외벽/자사(성수 외)',  commissionRate: '0.1000', isOverseas: false, isSpecialShare: null,        displayOrder: 2 },
  { code: 'outwall_share_seongsu', nameKo: '외벽/공판(성수)',     commissionRate: '0.1000', isOverseas: false, isSpecialShare: null,        displayOrder: 3 },
  { code: 'outwall_share_other',   nameKo: '외벽/공판(성수 외)',  commissionRate: '0.1000', isOverseas: false, isSpecialShare: null,        displayOrder: 4 },
  { code: 'exclusive_self',        nameKo: '전속/자사',            commissionRate: '0.1000', isOverseas: false, isSpecialShare: null,        displayOrder: 5 },
  { code: 'etc_self',              nameKo: '기타/자사',            commissionRate: '0.1000', isOverseas: false, isSpecialShare: null,        displayOrder: 6 },
  { code: 'fanclub_self',          nameKo: '팬클럽/자사',          commissionRate: '0.2000', isOverseas: false, isSpecialShare: null,        displayOrder: 7 },
  { code: 'fanclub_agency',        nameKo: '팬클럽/대행',          commissionRate: '0.3000', isOverseas: false, isSpecialShare: null,        displayOrder: 8 },
  { code: 'popup',                 nameKo: '팝업',                commissionRate: '0.1000', isOverseas: false, isSpecialShare: null,        displayOrder: 9 },
  { code: 'overseas',              nameKo: '해외매체',             commissionRate: '0.1500', isOverseas: true,  isSpecialShare: null,        displayOrder: 10 },
  { code: 'sales_agency',          nameKo: '영업대행',             commissionRate: '0.3000', isOverseas: false, isSpecialShare: null,        displayOrder: 11 },
  { code: 'purchase_only',         nameKo: '매입건',               commissionRate: '0.0000', isOverseas: false, isSpecialShare: null,        displayOrder: 12 },
  { code: 'sponsorship_self',      nameKo: '협찬/자사',            commissionRate: '0.0000', isOverseas: false, isSpecialShare: null,        displayOrder: 13 },
  { code: 'ip',                    nameKo: 'IP',                  commissionRate: '0.0000', isOverseas: false, isSpecialShare: 'narin_20', displayOrder: 14 },
  { code: 'han_river_bus',         nameKo: '한강버스',             commissionRate: '0.1000', isOverseas: false, isSpecialShare: null,        displayOrder: 15 },
  { code: 'china_biz',             nameKo: '중국사업',             commissionRate: '0.0000', isOverseas: false, isSpecialShare: null,        displayOrder: 16 },
] as const

const ACCOUNTS = [
  { code: 'ad_fee',           nameKo: '광고비',  displayOrder: 1 },
  { code: 'production_fee',   nameKo: '제작비',  displayOrder: 2 },
  { code: 'deposit',          nameKo: '보증금',  displayOrder: 3 },
  { code: 'contract_advance', nameKo: '계약금',  displayOrder: 4 },
  { code: 'advance',          nameKo: '선금',   displayOrder: 5 },
  { code: 'balance',          nameKo: '잔금',   displayOrder: 6 },
] as const

const SALES_METHODS = [
  { code: 'tax_invoice',   nameKo: '세금계산서', displayOrder: 1 },
  { code: 'cash_receipt',  nameKo: '현금영수증', displayOrder: 2 },
  { code: 'card',          nameKo: '카드결제',  displayOrder: 3 },
  { code: 'alipay',        nameKo: '알리페이',  displayOrder: 4 },
  { code: 'bank_transfer', nameKo: '계좌이체',  displayOrder: 5 },
] as const

const EXPENSE_CATEGORIES = [
  // 변동비
  { code: 'meals',           nameKo: '식대비',     isFixedCost: false, displayOrder: 1 },
  { code: 'transport',       nameKo: '교통비',     isFixedCost: false, displayOrder: 2 },
  { code: 'commission_fee',  nameKo: '지급수수료',  isFixedCost: false, displayOrder: 3 },
  { code: 'welfare',         nameKo: '복리후생비',  isFixedCost: false, displayOrder: 4 },
  { code: 'donation',        nameKo: '기부금',     isFixedCost: false, displayOrder: 5 },
  { code: 'books_print',     nameKo: '도서인쇄비',  isFixedCost: false, displayOrder: 6 },
  { code: 'travel',          nameKo: '출장비',     isFixedCost: false, displayOrder: 7 },
  { code: 'marketing',       nameKo: '마케팅비',    isFixedCost: false, displayOrder: 8 },
  { code: 'office_supplies', nameKo: '사무용품비',  isFixedCost: false, displayOrder: 9 },
  { code: 'entertainment',   nameKo: '접대비',     isFixedCost: false, displayOrder: 10 },
  { code: 'external_labor',  nameKo: '외부인건비',  isFixedCost: false, displayOrder: 11 },
  { code: 'postage',         nameKo: '우편요금',    isFixedCost: false, displayOrder: 12 },
  { code: 'outsourcing',     nameKo: '외주용역비',  isFixedCost: false, displayOrder: 13 },
  { code: 'cargo',           nameKo: '운반비',     isFixedCost: false, displayOrder: 14 },
  { code: 'education',       nameKo: '교육비',     isFixedCost: false, displayOrder: 15 },
  { code: 'other_var',       nameKo: '기타(변동)',  isFixedCost: false, displayOrder: 19 },
  // 고정비
  { code: 'labor',            nameKo: '인건비',       isFixedCost: true, displayOrder: 20 },
  { code: 'social_insurance', nameKo: '4대보험료',    isFixedCost: true, displayOrder: 21 },
  { code: 'office_rent',      nameKo: '지급임차료',   isFixedCost: true, displayOrder: 22 },
  { code: 'utility',          nameKo: '건물관리비',   isFixedCost: true, displayOrder: 23 },
  { code: 'communication',    nameKo: '통신비',       isFixedCost: true, displayOrder: 24 },
  { code: 'loan_interest',    nameKo: '대출이자',     isFixedCost: true, displayOrder: 25 },
] as const

async function main() {
  console.log('🌱 Seeding lookups...')
  await db.insert(dealCategory).values([...DEAL_CATEGORIES]).onConflictDoNothing()
  await db.insert(account).values([...ACCOUNTS]).onConflictDoNothing()
  await db.insert(salesMethod).values([...SALES_METHODS]).onConflictDoNothing()
  await db.insert(expenseCategory).values([...EXPENSE_CATEGORIES]).onConflictDoNothing()
  console.log(`✓ deal_category:     ${DEAL_CATEGORIES.length}`)
  console.log(`✓ account:           ${ACCOUNTS.length}`)
  console.log(`✓ sales_method:      ${SALES_METHODS.length}`)
  console.log(`✓ expense_category:  ${EXPENSE_CATEGORIES.length}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
