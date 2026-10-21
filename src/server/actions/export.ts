'use server'

import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { getCurrentEntity } from '@/server/entity'
import {
  counterparty,
  expense,
  expenseCategory,
} from '@/lib/db/schema'
import { listDeals, type DealListFilters } from '@/server/queries/deals'
import { canViewBankInfo, canViewCommission, getSessionUser } from '@/server/auth/guards'
import { entityInfo } from '@/lib/entity'
import { formatSettlement } from '@/lib/settlement'
import { incentivePercentText, incentiveRate, incentiveTotal, profitKrw } from '@/lib/incentive'
import { toXlsx, type XlsxCell } from '@/lib/xlsx'
import type { XlsxResult } from '@/server/actions/report-export'
import { toCsv } from '@/lib/csv'
import { audit } from '@/server/audit'

type ExportResult = { ok: true; filename: string; csv: string } | { error: string }

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
}

function numStr(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? '' : String(n)
}

/** 거래 목록 엑셀 (2026-10-21 요청: 화면 내용 그대로) — 화면과 같은 필터·정렬·컬럼 순서. 성과급은 볼 수 있는 거래만 */
export async function exportDealsXlsx(filters: DealListFilters): Promise<XlsxResult> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  try {
    const { rows } = await listDeals({ ...filters, page: 1, pageSize: 5000 })
    const foreign = !entityInfo(await getCurrentEntity()).hasVat
    // 화면처럼 소수점은 버림
    const won = (v: string | number | null | undefined) => {
      if (v === null || v === undefined || v === '') return null
      const n = typeof v === 'string' ? parseFloat(v) : v
      return Number.isFinite(n) ? Math.trunc(n) : null
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
        won(r.salesAmountNet),
        ...vat(won(r.salesVat)),
        won(r.salesAmountGross),
        won(r.purchaseAmountNet),
        ...vat(won(r.purchaseVat)),
        won(r.purchaseAmountGross),
        hasSales ? (r.salesPaidStatus === 'completed' ? '입금' : '미입금') : '',
        hasPurchase ? (r.purchasePaidStatus === 'completed' ? '결산' : '미결산') : '',
        r.salesMethodName ?? '',
        ...vat(r.salesInvoiceDate ?? '', r.purchaseInvoiceDate ?? ''),
        r.salesDueDate ?? '',
        r.salesPaidDate ?? '',
        r.settlementYear && r.settlementMonth ? formatSettlement(r.settlementYear, r.settlementMonth, r.settlementDay) : '',
        r.purchasePaidDate ?? '',
        won(r.profit),
        ...(foreign ? [won(krw)] : []),
        canView ? `${incentivePercentText(incentiveRate(r.commissionPct))}%` : '',
        canView ? won(incentiveTotal(base, r.commissionPct, r.incentiveShares, r.commissionAmount)) : null,
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

export type CounterpartyExportFilters = {
  q?: string
  role?: string
  noBiz?: boolean
}

export async function exportCounterpartiesCsv(
  filters: CounterpartyExportFilters,
): Promise<ExportResult> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  try {
    const conds = [
      eq(counterparty.entity, await getCurrentEntity()),
      isNull(counterparty.deletedAt),
      eq(counterparty.isActive, true),
    ]
    if (filters.q)
      conds.push(
        or(
          ilike(counterparty.name, `%${filters.q}%`),
          ilike(counterparty.businessNo, `%${filters.q}%`),
        )!,
      )
    if (filters.role)
      conds.push(sql`${counterparty.roleTags} @> ARRAY[${filters.role}]::text[]`)
    if (filters.noBiz)
      conds.push(
        or(
          isNull(counterparty.businessNo),
          eq(counterparty.businessNo, ''),
        )!,
      )

    const rows = await db
      .select({
        name: counterparty.name,
        businessNo: counterparty.businessNo,
        roleTags: counterparty.roleTags,
        paymentTerm: counterparty.paymentTerm,
        officialFeeRate: counterparty.officialFeeRate,
        bankName: counterparty.bankName,
        accountHolder: counterparty.accountHolder,
        accountNo: counterparty.accountNo,
        memo: counterparty.memo,
      })
      .from(counterparty)
      .where(and(...conds))
      .orderBy(asc(counterparty.name))
      .limit(5000)

    const showBank = canViewBankInfo(user.role)
    const headers = [
      '상호명',
      '사업자번호',
      '역할',
      ...(showBank ? ['거래은행', '예금주', '계좌번호'] : []),
      '결제일',
      '수수료',
      '비고',
    ]

    const csvRows = rows.map((r): (string | number | null)[] => [
      r.name,
      r.businessNo ?? '',
      r.roleTags.map((t) => ROLE_LABEL[t] ?? t).join(', '),
      ...(showBank ? [r.bankName ?? '', r.accountHolder ?? '', r.accountNo ?? ''] : []),
      r.paymentTerm ?? '',
      r.officialFeeRate ?? '',
      r.memo ?? '',
    ])

    await audit({ action: 'export.csv', targetType: 'export', targetLabel: 'counterparties.csv', summary: `CSV 내보내기 counterparties.csv (${csvRows.length}건)`, detail: filters })
    return { ok: true, filename: 'counterparties.csv', csv: toCsv(headers, csvRows) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '내보내기 실패' }
  }
}

export type ExpenseExportFilters = {
  q?: string
  year?: number
  month?: number
  categoryId?: number
  method?: string
}

export async function exportExpensesCsv(
  filters: ExpenseExportFilters,
): Promise<ExportResult> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  try {
    const conds = [eq(expense.entity, await getCurrentEntity()), isNull(expense.deletedAt)]
    if (filters.year) conds.push(eq(expense.year, filters.year))
    if (filters.month) conds.push(eq(expense.month, filters.month))
    if (filters.categoryId)
      conds.push(eq(expense.expenseCategoryId, filters.categoryId))
    if (filters.method)
      conds.push(eq(expense.paymentMethod, filters.method as 'corporate_card'))
    if (filters.q) {
      const like = `%${filters.q}%`
      conds.push(
        or(ilike(expense.itemName, like), ilike(expense.counterpartyText, like))!,
      )
    }
    const where = and(...conds)

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
      .where(where)
      .orderBy(desc(expense.expenseDate), desc(expense.createdAt))
      .limit(5000)

    const headers = ['지출일', '품목', '거래처', '항목', '수단', '금액']

    const csvRows = rows.map((r): (string | number | null)[] => [
      r.date,
      r.itemName ?? '',
      r.counterpartyText ?? '',
      r.category ?? '',
      PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod,
      numStr(r.amount),
    ])

    const filename = filters.year ? `expenses_${filters.year}.csv` : 'expenses.csv'
    await audit({ action: 'export.csv', targetType: 'export', targetLabel: filename, summary: `CSV 내보내기 ${filename} (${csvRows.length}건)`, detail: filters })
    return { ok: true, filename, csv: toCsv(headers, csvRows) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '내보내기 실패' }
  }
}
