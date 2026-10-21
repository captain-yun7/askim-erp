'use server'

import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { getCurrentEntity } from '@/server/entity'
import { expense, expenseCategory } from '@/lib/db/schema'
import { listDeals, type DealListFilters } from '@/server/queries/deals'
import { listCounterparties, type CounterpartyListFilters } from '@/server/queries/counterparties'
import { expenseListWhere, type ExpenseListFilters } from '@/server/queries/expenses'
import { clientTypeLabel } from '@/lib/client-type'
import { canAccessBackoffice, canViewBankInfo, canViewCommission, getSessionUser } from '@/server/auth/guards'
import { entityInfo } from '@/lib/entity'
import { formatSettlement } from '@/lib/settlement'
import { incentivePercentText, incentiveRate, incentiveTotal, profitKrw } from '@/lib/incentive'
import { toXlsx, type XlsxCell } from '@/lib/xlsx'
import type { XlsxResult } from '@/server/actions/report-export'
import { audit } from '@/server/audit'

const ROLE_LABEL: Record<string, string> = {
  media: '매체사',
  advertiser: '광고주',
  agency: '대행사',
  expense_vendor: '지출처',
}

const PAYMENT_LABEL: Record<string, string> = {
  corporate_card: '법인카드',
  personal_card: '개인카드',
  cash: '현금',
  bank_transfer: '이체',
}

/** 거래 목록 엑셀 (2026-10-21 요청: 화면 내용 그대로) — 화면과 같은 필터·정렬·컬럼 순서. 성과급은 볼 수 있는 거래만 */
export async function exportDealsXlsx(filters: DealListFilters): Promise<XlsxResult> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  try {
    const { rows } = await listDeals({ ...filters, page: 1, pageSize: 5000 })
    const foreign = !entityInfo(await getCurrentEntity()).hasVat
    // 화면처럼 소수점은 버림
    // 원화는 화면처럼 소수점 버림, 외화(달러·위안)는 센트까지
    const num = (v: string | number | null | undefined, currency = 'KRW') => {
      if (v === null || v === undefined || v === '') return null
      const n = typeof v === 'string' ? parseFloat(v) : v
      if (!Number.isFinite(n)) return null
      return currency === 'KRW' ? Math.trunc(n) : Math.round(n * 100) / 100
    }
    const vat = <T,>(...v: T[]) => (foreign ? [] : v)

    const headers = [
      '거래코드', '귀속', '상품구분', '담당', '발행처', '실광고주', '매체사', '품목명',
      '매출', ...vat('부가세'), foreign ? '총매출' : '총매출(VAT 포함)',
      '매입', ...vat('부가세'), foreign ? '총매입' : '총매입(VAT 포함)',
      '입금', '결산', '매출수단', ...vat('매출계산서 발행일', '매입계산서 발행일'),
      '입금예정일', '입금일', '결산연월일', '결산일',
      '손익', ...(foreign ? ['손익(KRW)'] : []), '인센티브(%)', '성과급',
      '매체사 은행', '매체사 계좌번호', '매체사 예금주',
    ]

    const body = rows.map((r): XlsxCell[] => {
      const hasSales = parseFloat(r.salesAmountNet ?? '0') !== 0
      const hasPurchase = parseFloat(r.purchaseAmountNet ?? '0') !== 0
      const krw = profitKrw(r.profit, r.currency, r.fxRate)
      const base = foreign ? krw : r.profit != null ? parseFloat(r.profit) : null
      const canView = canViewCommission(user, { status: r.status as 'draft' | 'confirmed' | 'closed', ownerUserId: r.ownerUserId })
      return [
        r.dealCode,
        `${String(r.accrualYear).slice(2)}/${r.accrualMonth}`,
        r.categoryName ?? '',
        r.ownerName ?? '',
        r.issuerName ?? '',
        r.advertiserName && r.advertiserName !== r.issuerName ? r.advertiserName : '',
        r.supplierName ?? '',
        r.itemName ?? '',
        num(r.salesAmountNet, r.currency),
        ...vat(num(r.salesVat, r.currency)),
        num(r.salesAmountGross, r.currency),
        num(r.purchaseAmountNet, r.currency),
        ...vat(num(r.purchaseVat, r.currency)),
        num(r.purchaseAmountGross, r.currency),
        hasSales ? (r.salesPaidStatus === 'completed' ? '입금' : '미입금') : '',
        hasPurchase ? (r.purchasePaidStatus === 'completed' ? '결산' : '미결산') : '',
        r.salesMethodName ?? '',
        ...vat(r.salesInvoiceDate ?? '', r.purchaseInvoiceDate ?? ''),
        r.salesDueDate ?? '',
        r.salesPaidDate ?? '',
        r.settlementYear && r.settlementMonth ? formatSettlement(r.settlementYear, r.settlementMonth, r.settlementDay) : '',
        r.purchasePaidDate ?? '',
        num(r.profit, r.currency),
        ...(foreign ? [num(krw)] : []),
        canView ? `${incentivePercentText(incentiveRate(r.commissionPct))}%` : '',
        canView ? num(incentiveTotal(base, r.commissionPct, r.incentiveShares, r.commissionAmount)) : null,
        r.supplierBankName ?? '',
        r.supplierAccountNo ?? '',
        r.supplierAccountHolder ?? '',
      ]
    })

    const filename = `거래_${filters.year ?? (filters.years?.length ? filters.years.join('-') : '전체')}.xlsx`
    await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename} (${rows.length}건)`, detail: filters })
    const widths = headers.map((h) => (h === '품목명' ? 36 : h === '발행처' || h === '매체사' || h === '실광고주' ? 24 : 14))
    return { ok: true, filename, base64: toXlsx([{ name: '거래', rows: [headers, ...body], widths }]) }
  } catch (e) {
    console.error('exportDealsXlsx', e)
    return { error: '내보내기 실패' }
  }
}

/** 거래처 목록 엑셀 (2026-10-21 요청: CSV 대신 엑셀) — 화면과 같은 조건·순서·컬럼 */
export async function exportCounterpartiesXlsx(filters: CounterpartyListFilters): Promise<XlsxResult> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  try {
    const rows = await listCounterparties(filters)
    const showBank = canViewBankInfo(user.role)
    const headers = ['상호명', '사업자번호', '역할', '구분', ...(showBank ? ['거래은행', '예금주', '계좌번호'] : []), '수수료', '결제일', '비고']
    const body = rows.map((r): XlsxCell[] => [
      r.name,
      r.businessNo ?? '',
      r.roleTags.map((t) => ROLE_LABEL[t] ?? t).join(', '),
      clientTypeLabel(r.clientType),
      ...(showBank ? [r.bankName ?? '', r.accountHolder ?? '', r.accountNo ?? ''] : []),
      r.officialFeeRate ?? '',
      r.paymentTerm ?? '',
      r.memo ?? '',
    ])
    const filename = '거래처.xlsx'
    await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename} (${rows.length}건)`, detail: filters })
    const widths = headers.map((h) => (h === '상호명' || h === '비고' ? 30 : 14))
    return { ok: true, filename, base64: toXlsx([{ name: '거래처', rows: [headers, ...body], widths }]) }
  } catch (e) {
    console.error('exportCounterpartiesXlsx', e)
    return { error: '내보내기 실패' }
  }
}

/** 판관비 목록 엑셀 (2026-10-21 요청: CSV 대신 엑셀) — 화면과 같은 조건·순서. 판관비 화면을 볼 수 있는 사람만 */
export async function exportExpensesXlsx(filters: ExpenseListFilters): Promise<XlsxResult> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canAccessBackoffice(user.role)) return { error: '권한이 없습니다' }

  try {
    const rows = await db
      .select({
        date: expense.expenseDate,
        itemName: expense.itemName,
        amount: expense.amount,
        counterpartyText: expense.counterpartyText,
        paymentMethod: expense.paymentMethod,
        category: expenseCategory.nameKo,
      })
      .from(expense)
      .leftJoin(expenseCategory, eq(expenseCategory.id, expense.expenseCategoryId))
      .where(await expenseListWhere(filters))
      .orderBy(desc(expense.expenseDate), desc(expense.createdAt), desc(expense.id))
      // 판관비는 4천여 건이라 5천 제한에 곧 닿는다 (2026-10-21) — 엑셀은 넉넉히
      .limit(50000)

    const headers = ['지출일', '품목', '거래처', '항목', '수단', '금액']
    const body = rows.map((r): XlsxCell[] => [
      r.date,
      r.itemName ?? '',
      r.counterpartyText ?? '',
      r.category ?? '',
      PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod,
      r.amount == null ? null : Math.round(parseFloat(r.amount) * 100) / 100,
    ])
    const filename = `판관비_${filters.year ?? '전체'}${filters.month ? `-${String(filters.month).padStart(2, '0')}` : ''}.xlsx`
    await audit({ action: 'export.xlsx', targetType: 'export', targetLabel: filename, summary: `엑셀 다운로드 ${filename} (${rows.length}건)`, detail: filters })
    return { ok: true, filename, base64: toXlsx([{ name: '판관비', rows: [headers, ...body], widths: [12, 36, 24, 14, 10, 14] }]) }
  } catch (e) {
    console.error('exportExpensesXlsx', e)
    return { error: '내보내기 실패' }
  }
}
