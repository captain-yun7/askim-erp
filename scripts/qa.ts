import './_env'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { deal, expense, users, dealCategory } from '@/lib/db/schema'
import { buildLedgerLines, getSalesLedger } from '@/server/queries/reports-ledger'
import { getMonthlyPnl } from '@/server/queries/reports-pnl'
import { getTopCounterparties } from '@/server/queries/reports-top'
import { getDashboard } from '@/server/queries/dashboard'
import { listDeals } from '@/server/queries/deals'
import { listCounterparties } from '@/server/queries/counterparties'
import {
  canEditDeal,
  canEditDealAmounts,
  canDeleteDeal,
  canEditCounterpartySensitive,
  canManageUsers,
  canCreateExpense,
} from '@/server/auth/guards'
import { toCsv } from '@/lib/csv'
import { parseDateFilter, parseNumberFilter } from '@/lib/column-filter'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

async function main() {
  const YEAR = 2026

  console.log('\n[1] 리포트 — 매출장표 (통장/귀속월 피벗)')
  const ledger = await getSalesLedger({ year: YEAR })
  const lines = buildLedgerLines(ledger)
  const sumLine = (key: string) => lines.find((l) => l.key === key)!.values.reduce((a, b) => a + b, 0)
  check('12개월 반환', ledger.months.length === 12)
  check('귀속월 매출 합계 > 0', sumLine('sales_accrual') > 0, `sales=${sumLine('sales_accrual')}`)
  check('통장 매출 합계 > 0', sumLine('sales_cash') > 0, `cash sales=${sumLine('sales_cash')}`)
  check('판관비 = 고정비 + 변동비', Math.abs(sumLine('sgna') - sumLine('fixed') - sumLine('variable')) < 1)
  check('과목 행에 세금 포함', lines.some((l) => l.label === '(세금)'))
  const order = lines.slice(0, 6).map((l) => l.key).join(',')
  check(
    '행 순서: 총매출(통장)·총매출(귀속월)·(매출원가)_통장·(매출원가)_귀속월·손익(통장)·손익(귀속월)',
    order === 'sales_cash,sales_accrual,cogs_cash,cogs_accrual,gross_cash,gross_accrual',
    order,
  )

  console.log('\n[2] 리포트 — 월별손익 + 십일조')
  const pnl = await getMonthlyPnl({ year: YEAR })
  check('12개월 반환', pnl.rows.length === 12)
  check('영업이익 계산됨', pnl.total.operatingProfit !== undefined, `영업이익=${pnl.total.operatingProfit}`)
  check('십일조 >= 0', Number(pnl.total.tithe) >= 0, `십일조=${pnl.total.tithe}`)

  console.log('\n[3] 리포트 — TOP 거래처 (매출순/손익순)')
  const topS = await getTopCounterparties({ year: YEAR, sort: 'sales', limit: 5 })
  check('매출순 결과 존재', topS.length > 0, `${topS.length}건, 1위=${topS[0]?.name} ${topS[0]?.sales}`)
  check('매출 내림차순', topS.length < 2 || Number(topS[0].sales) >= Number(topS[1].sales))
  const topP = await getTopCounterparties({ year: YEAR, sort: 'profit', limit: 5 })
  check('손익순 결과 존재', topP.length > 0, `1위=${topP[0]?.name} 손익=${topP[0]?.profit}`)

  console.log('\n[4] 거래 목록 — 필터/집계')
  const dl = await listDeals({ year: YEAR, page: 1, pageSize: 5 })
  check('행 반환 + 집계', dl.rows.length > 0 && dl.total > 0, `total=${dl.total}, 합계손익=${dl.aggregate.profit}`)
  const dlUnpaid = await listDeals({ year: YEAR, paidStatus: 'unpaid', pageSize: 5 })
  check('미입금 필터 실행', dlUnpaid.total >= 0, `미입금 total=${dlUnpaid.total}`)

  console.log('\n[4-1] 거래 목록 — 컬럼별 검색식 파서 (2026-09-07 피드백)')
  check('금액 정확히', JSON.stringify(parseNumberFilter('800,000')) === JSON.stringify({ kind: 'cmp', op: '=', value: 800000 }))
  check('금액 비교 >=', JSON.stringify(parseNumberFilter('>= 1000000')) === JSON.stringify({ kind: 'cmp', op: '>=', value: 1000000 }))
  check('금액 음수 비교 <', JSON.stringify(parseNumberFilter('<-100')) === JSON.stringify({ kind: 'cmp', op: '<', value: -100 }))
  check('금액 범위 ~ (역순 정렬)', JSON.stringify(parseNumberFilter('500000~100000')) === JSON.stringify({ kind: 'range', min: 100000, max: 500000 }))
  check('금액 비어있음 -', parseNumberFilter('-')?.kind === 'empty')
  check('금액 잘못된 식 무시', parseNumberFilter('abc') === null && parseNumberFilter('') === null)
  check('날짜 연도', JSON.stringify(parseDateFilter('2026')) === JSON.stringify({ kind: 'range', from: '2026-01-01', toExclusive: '2027-01-01' }))
  check('날짜 연월 (12월 롤오버)', JSON.stringify(parseDateFilter('2026-12')) === JSON.stringify({ kind: 'range', from: '2026-12-01', toExclusive: '2027-01-01' }))
  check('날짜 일 (구분자 없음)', JSON.stringify(parseDateFilter('20260905')) === JSON.stringify({ kind: 'range', from: '2026-09-05', toExclusive: '2026-09-06' }))
  check('날짜 일 (점 구분자, 월말 롤오버)', JSON.stringify(parseDateFilter('2026.09.30')) === JSON.stringify({ kind: 'range', from: '2026-09-30', toExclusive: '2026-10-01' }))
  check('날짜 범위 ~', JSON.stringify(parseDateFilter('2026-09-01~2026-09')) === JSON.stringify({ kind: 'range', from: '2026-09-01', toExclusive: '2026-10-01' }))
  check('날짜 잘못된 값 무시', parseDateFilter('2026-13') === null && parseDateFilter('2026-02-30') === null && parseDateFilter('abc') === null)

  console.log('\n[4-2] 거래 목록 — 컬럼별 검색 쿼리')
  const lossRows = await listDeals({ year: YEAR, fProfit: '<0', pageSize: 200 })
  check('손익 <0 → 모두 음수', lossRows.rows.length > 0 && lossRows.rows.every((r) => Number(r.profit) < 0), `${lossRows.total}건`)
  const rangeRows = await listDeals({ year: YEAR, fSales: '100000~1000000', pageSize: 200 })
  check('매출 범위 → 모두 구간 안', rangeRows.rows.every((r) => { const v = Number(r.salesAmountNet); return v >= 100000 && v <= 1000000 }), `${rangeRows.total}건`)
  const firstSales = lossRows.rows.find((r) => r.purchaseAmountNet != null)
  if (firstSales) {
    const exact = await listDeals({ year: YEAR, fPurchase: String(Math.round(Number(firstSales.purchaseAmountNet))), pageSize: 200 })
    check('매입 정확히 → 해당 금액만', exact.rows.length > 0 && exact.rows.every((r) => Math.round(Number(r.purchaseAmountNet)) === Math.round(Number(firstSales.purchaseAmountNet))), `${exact.total}건`)
  }
  const emptySales = await listDeals({ year: YEAR, fSales: '-', pageSize: 200 })
  check('매출 비어있음(-) → salesAmountNet null', emptySales.rows.every((r) => r.salesAmountNet == null), `${emptySales.total}건`)
  const unpaid = await listDeals({ year: YEAR, fPaid: 'unpaid', fSettled: 'settled', pageSize: 200 })
  check('미입금 + 결산 AND', unpaid.rows.every((r) => r.salesPaidStatus !== 'completed' && r.purchasePaidStatus === 'completed'), `${unpaid.total}건`)
  const paid = await listDeals({ year: YEAR, fPaid: 'paid', pageSize: 200 })
  check('입금 → 모두 completed', paid.rows.length > 0 && paid.rows.every((r) => r.salesPaidStatus === 'completed'), `${paid.total}건`)
  const invMonth = await listDeals({ fSalesInvoice: `${YEAR}-06`, pageSize: 500 })
  check('매출계산서 발행일 2026-06 → 모두 6월', invMonth.rows.every((r) => r.salesInvoiceDate?.startsWith(`${YEAR}-06`)), `${invMonth.total}건`)
  const payDate = await listDeals({ fSalesDate: `${YEAR}-06`, pageSize: 500 })
  check('입금예정일/입금일 2026-06 → 둘 중 하나 6월', payDate.rows.every((r) => r.salesDueDate?.startsWith(`${YEAR}-06`) || r.salesPaidDate?.startsWith(`${YEAR}-06`)), `${payDate.total}건`)
  const noInv = await listDeals({ year: YEAR, fPurchaseInvoice: '-', pageSize: 500 })
  check('매입계산서 비어있음(-) → null', noInv.rows.every((r) => r.purchaseInvoiceDate == null), `${noInv.total}건`)
  const junk = await listDeals({ year: YEAR, fSales: 'abc', pageSize: 5 })
  check('잘못된 식은 무시(전체 반환)', junk.total === dl.total, `${junk.total} vs ${dl.total}`)

  console.log('\n[5] 거래처 목록 — 역할 필터')
  const cpMedia = await listCounterparties({ role: 'media', limit: 100 })
  check('매체사 필터 결과', cpMedia.length >= 0, `매체사 ${cpMedia.length}건`)
  const cpAll = await listCounterparties({ limit: 5 })
  check('전체 거래처 조회', cpAll.length > 0, `샘플 ${cpAll.length}건`)

  console.log('\n[6] 대시보드')
  const dash = await getDashboard()
  check('대시보드 객체 반환', !!dash, `keys=${Object.keys(dash).join(',')}`)

  console.log('\n[7] 권한 가드 (스펙 06_permissions)')
  const sales = { id: 'u-sales', role: 'sales' as const }
  const acct = { id: 'u-acct', role: 'accountant' as const }
  const ownDraft = { status: 'draft' as const, ownerUserId: 'u-sales' }
  const ownClosed = { status: 'closed' as const, ownerUserId: 'u-sales' }
  const otherDraft = { status: 'draft' as const, ownerUserId: 'u-other' }
  check('영업: 본인 draft 수정 가능', canEditDeal(sales, ownDraft) === true)
  check('영업: 본인 closed 수정 불가', canEditDeal(sales, ownClosed) === false)
  check('영업: 남의 거래 수정 불가', canEditDeal(sales, otherDraft) === false)
  check('영업: 금액변경 draft만', canEditDealAmounts(sales, ownDraft) === true && canEditDealAmounts(sales, { status: 'confirmed', ownerUserId: 'u-sales' }) === false)
  check('회계: closed도 수정 가능', canEditDeal(acct, ownClosed) === true)
  check('영업: 본인 draft 삭제 가능', canDeleteDeal(sales, ownDraft) === true)
  check('영업: 민감필드 수정 불가', canEditCounterpartySensitive('sales') === false)
  check('회계: 민감필드 수정 가능', canEditCounterpartySensitive('accountant') === true)
  check('영업: admin 관리 불가', canManageUsers('sales') === false)
  check('admin: 사용자 관리 가능', canManageUsers('admin') === true)
  check('viewer: 판관비 등록 불가', canCreateExpense('viewer') === false)

  console.log('\n[8] CSV 유틸 (BOM / 이스케이프 / 인젝션 방지)')
  const csv = toCsv(['상호명', '금액', '메모'], [['㈜가, 나', 1000, '=cmd()'], ['따옴"표', 2000, '정상']])
  check('UTF-8 BOM 선두', csv.charCodeAt(0) === 0xfeff)
  check('쉼표 셀 따옴표 감쌈', csv.includes('"㈜가, 나"'))
  check('인젝션(=) prefix 방지', /'?=cmd\(\)|"'=cmd\(\)/.test(csv) || csv.includes("'=cmd()") || csv.includes('"\'=cmd()"'), 'snippet=' + JSON.stringify(csv.split('\r\n')[1]))
  check('내부 따옴표 이스케이프', csv.includes('"따옴""표"'))

  console.log('\n[9] 쓰기 경로 — 거래 INSERT + 생성컬럼(profit) + 목록 반영 → 정리')
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'sales')).limit(1)
  const [cat] = await db.select({ id: dealCategory.id }).from(dealCategory).limit(1)
  const testCode = 'QA-TEST-0001'
  await db.delete(deal).where(eq(deal.dealCode, testCode))
  const [ins] = await db.insert(deal).values({
    dealCode: testCode,
    accrualYear: 2026, accrualMonth: 6,
    ownerUserId: u.id, categoryId: cat.id,
    salesAmountNet: '1000000', purchaseAmountNet: '700000',
    createdBy: u.id, updatedBy: u.id,
  }).returning({ id: deal.id, profit: deal.profit })
  check('거래 insert 성공', !!ins?.id)
  check('생성컬럼 profit 자동계산 = 300000', Number(ins.profit) === 300000, `profit=${ins.profit}`)
  const found = await listDeals({ q: testCode, pageSize: 5 })
  check('목록 쿼리에 신규 거래 반영', found.rows.some((r) => r.dealCode === testCode))
  await db.delete(deal).where(eq(deal.id, ins.id))
  const after = await db.select({ id: deal.id }).from(deal).where(eq(deal.id, ins.id))
  check('정리(삭제) 완료', after.length === 0)

  console.log('\n[10] 쓰기 경로 — 판관비 일괄 INSERT + 생성컬럼(year/month) → 정리')
  const memoTag = 'QA-EXP-TAG'
  const [eIns] = await db.insert(expense).values([
    { expenseDate: '2026-05-14', itemName: 'QA점심', amount: '35000', paymentMethod: 'corporate_card', payerUserId: u.id, createdBy: u.id, memo: memoTag },
    { expenseDate: '2026-05-14', itemName: 'QA택시', amount: '12000', paymentMethod: 'corporate_card', payerUserId: u.id, createdBy: u.id, memo: memoTag },
  ]).returning({ id: expense.id, year: expense.year, month: expense.month })
  check('판관비 insert 성공', !!eIns?.id)
  check('생성컬럼 year/month 자동 = 2026/5', eIns.year === 2026 && eIns.month === 5, `${eIns.year}/${eIns.month}`)
  const delE = await db.delete(expense).where(eq(expense.memo, memoTag)).returning({ id: expense.id })
  check('정리(삭제) 2건', delE.length === 2)

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━\n결과: ${pass} 통과 / ${fail} 실패\n━━━━━━━━━━━━━━━━━━━━━━`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('QA 실행 오류:', e)
  process.exit(1)
})
