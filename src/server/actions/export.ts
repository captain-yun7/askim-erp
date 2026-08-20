'use server'

import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  counterparty,
  expense,
  expenseCategory,
} from '@/lib/db/schema'
import { listDeals, type DealListFilters } from '@/server/queries/deals'
import { canViewBankInfo, getSessionUser } from '@/server/auth/guards'
import { toCsv } from '@/lib/csv'

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

const DEAL_STATUS_LABEL: Record<string, string> = {
  draft: '작성중',
  confirmed: '확정',
  closed: '완료',
}

const PAID_STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  partial: '부분',
  completed: '완료',
}

function numStr(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? '' : String(n)
}

export async function exportDealsCsv(filters: DealListFilters): Promise<ExportResult> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }

  try {
    const { rows } = await listDeals({ ...filters, page: 1, pageSize: 5000 })

    const headers = [
      '거래코드',
      '귀속연월',
      '상품구분',
      '담당자',
      '발행처',
      '실광고주',
      '매체사',
      '매출금',
      '매입금',
      '손익',
      '입금상태',
      '결산상태',
      '상태',
    ]

    const csvRows = rows.map((r): (string | number | null)[] => [
      r.dealCode,
      `${r.accrualYear}-${String(r.accrualMonth).padStart(2, '0')}`,
      r.categoryName ?? '',
      r.ownerName ?? '',
      r.issuerName ?? '',
      r.advertiserName ?? '',
      r.supplierName ?? '',
      numStr(r.salesAmountNet),
      numStr(r.purchaseAmountNet),
      numStr(r.profit),
      PAID_STATUS_LABEL[r.salesPaidStatus] ?? r.salesPaidStatus,
      PAID_STATUS_LABEL[r.purchasePaidStatus] ?? r.purchasePaidStatus,
      DEAL_STATUS_LABEL[r.status] ?? r.status,
    ])

    const filename = filters.year ? `deals_${filters.year}.csv` : 'deals.csv'
    return { ok: true, filename, csv: toCsv(headers, csvRows) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '내보내기 실패' }
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
    const conds = [isNull(expense.deletedAt)]
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
    return { ok: true, filename, csv: toCsv(headers, csvRows) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '내보내기 실패' }
  }
}
