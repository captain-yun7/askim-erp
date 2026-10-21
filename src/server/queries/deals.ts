import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { alias, type PgColumn } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { getCurrentEntity } from '@/server/entity'
import { parseDateFilter, parseNumberFilter } from '@/lib/column-filter'
import { getRecentChanges } from '@/server/deal-changes'
import { getChangeHighlightDays } from '@/server/queries/app-settings'
import { getAttachmentCounts } from '@/server/actions/attachments'
import type { DealSort } from '@/lib/deal-sort'
import type { IncentiveShare } from '@/lib/incentive'
import { getSessionUser } from '@/server/auth/guards'
import { resolveDealScope } from '@/server/auth/deal-scope'
import {
  counterparty,
  deal,
  dealCategory,
  users,
salesMethod } from '@/lib/db/schema'

// 매체사 계좌정보용 별칭 조인
const supplierCp = alias(counterparty, 'supplier_cp')

export type DealListFilters = {
  q?: string
  /** 컬럼별 검색 (2026-09-01 피드백) */
  fCode?: string
  fIssuer?: string
  fSupplier?: string
  fItem?: string
  /** 금액·날짜·상태 컬럼 검색 (2026-09-07 피드백) — 검색식은 lib/column-filter 참고 */
  fSales?: string
  fSalesVat?: string
  fPurchase?: string
  fPurchaseVat?: string
  fProfit?: string
  /** 부가세 포함 총매출·총매입 (2026-09-17) */
  fSalesGross?: string
  fPurchaseGross?: string
  fPaid?: 'paid' | 'unpaid'
  fSettled?: 'settled' | 'unsettled'
  fSalesInvoice?: string
  fPurchaseInvoice?: string
  /** 입금예정일 또는 입금일 */
  fSalesDate?: string
  /** 결산예정일 또는 결산일 */
  fPurchaseDate?: string
  /** 두 줄 헤더 컬럼은 필터도 두 칸 (2026-09-16 피드백) — 예정일·실제일 각각 */
  fSalesDue?: string
  fSalesPaid?: string
  fPurchaseDue?: string
  fPurchasePaid?: string
  /** 매출수단 (2026-10-21 요청) — id, '-' 는 비어 있는 거래 */
  fSalesMethod?: string
  year?: number
  /** 귀속연도 다중 선택 (2026-09-16 피드백) */
  years?: number[]
  month?: number
  /** 월 다중 선택 (2026-09-09) — month 와 함께 오면 둘 다 적용 */
  months?: number[]
  categoryId?: number
  categoryIds?: number[]
  /** 담당자 다중 선택 */
  ownerUserIds?: string[]
  paidStatus?: 'pending' | 'completed' | 'partial' | 'unpaid' | 'unsettled' | 'all'
  /** 상태 다중 선택 — 미입금 OR 미결산 */
  paidStatuses?: ('unpaid' | 'unsettled')[]
  /** 수정 모아보기 (2026-10-08): 최근 수정 표시 기간 안에 바뀐 칸이 있는 거래만 */
  changedOnly?: boolean
  /** 수정요청/완료 표시로 거르기 (2026-10-08) */
  reviewStatuses?: ('requested' | 'done')[]
  page?: number
  pageSize?: number
  /** 정렬 기준 (2026-09-15 고객 확정: 기본 작성순, 귀속월·입금일·거래코드 등 선택) */
  sort?: DealSort
  dir?: 'asc' | 'desc'
}


/** 금액 컬럼 검색식 → 조건. 잘못된 식은 무시 */
function numberCond(col: PgColumn, raw: string | undefined): SQL | undefined {
  const f = parseNumberFilter(raw)
  if (!f) return undefined
  if (f.kind === 'empty') return isNull(col)
  if (f.kind === 'nonempty') return isNotNull(col)
  if (f.kind === 'range') return sql`${col} between ${f.min} and ${f.max}`
  // 정확히 일치는 원 단위 반올림 비교 (소수 자리 무시)
  if (f.op === '=') return sql`round(${col}) = ${Math.round(f.value)}`
  return sql`${col} ${sql.raw(f.op)} ${f.value}`
}

/** 날짜 컬럼 검색식 → 조건. 컬럼이 여러 개면 하나라도 맞으면 매칭 */
function dateCond(cols: PgColumn[], raw: string | undefined): SQL | undefined {
  const f = parseDateFilter(raw)
  if (!f) return undefined
  if (f.kind === 'nonempty') return or(...cols.map((col) => isNotNull(col)))
  const per = cols.map((col) =>
    f.kind === 'empty'
      ? isNull(col)
      : sql`${col} >= ${f.from}::date and ${col} < ${f.toExclusive}::date`,
  )
  return f.kind === 'empty' ? and(...per) : or(...per)
}

/** 결산예정일 검색 — 날짜가 없으면 목록에 보이는 결산연월(1일 기준)로 비교 */
function purchaseDueCond(raw: string | undefined): SQL | undefined {
  const f = parseDateFilter(raw)
  if (!f) return undefined
  const ym = sql`make_date(${deal.settlementYear}, ${deal.settlementMonth}, 1)`
  const hasYm = sql`${deal.settlementYear} is not null and ${deal.settlementMonth} between 1 and 12`
  if (f.kind === 'empty') return sql`(${deal.purchaseDueDate} is null and not (${hasYm}))`
  // or 가 들어가는 식은 전체를 괄호로 묶는다 — 안 묶으면 다른 필터와 and 로 이어질 때 앞 조건이 전부 무시된다 (2026-09-29)
  if (f.kind === 'nonempty') return sql`(${deal.purchaseDueDate} is not null or (${hasYm}))`
  return sql`((${deal.purchaseDueDate} >= ${f.from}::date and ${deal.purchaseDueDate} < ${f.toExclusive}::date) or (${deal.purchaseDueDate} is null and ${hasYm} and ${ym} >= date_trunc('month', ${f.from}::date) and ${ym} < ${f.toExclusive}::date))`
}

/** 정렬 기준 → orderBy 목록. 같은 값끼리는 작성순(최신 위) */
function orderFor(sort: DealSort, dir: 'asc' | 'desc') {
  const d = dir === 'asc' ? asc : desc
  const tail = [desc(deal.createdAt), desc(deal.id)]
  switch (sort) {
    case 'accrual': return [d(deal.accrualYear), d(deal.accrualMonth), ...tail]
    case 'salesPaid': return [sql`${deal.salesPaidDate} ${sql.raw(dir)} nulls last`, ...tail]
    case 'salesDue': return [sql`${deal.salesDueDate} ${sql.raw(dir)} nulls last`, ...tail]
    case 'purchasePaid': return [sql`${deal.purchasePaidDate} ${sql.raw(dir)} nulls last`, ...tail]
    // 거래코드는 '-' 뒤 번호를 숫자로 비교 (AK260701-2 다음이 -10, 2026-09-16 피드백). 번호 없는 본 코드는 가지번호보다 앞
    case 'code':
      return [
        d(sql`split_part(${deal.dealCode}, '-', 1)`),
        sql`coalesce(nullif(regexp_replace(substring(${deal.dealCode} from position('-' in ${deal.dealCode}) + 1), '[^0-9]', '', 'g'), '')::bigint * (case when position('-' in ${deal.dealCode}) > 0 then 1 else 0 end), 0) ${sql.raw(dir)}`,
        d(deal.dealCode),
        ...tail,
      ]
    case 'sales': return [sql`${deal.salesAmountNet} ${sql.raw(dir)} nulls last`, ...tail]
    case 'profit': return [sql`${deal.profit} ${sql.raw(dir)} nulls last`, ...tail]
    default: return [d(deal.createdAt), d(deal.id)]
  }
}

/** 매출/매입 금액이 있는 건만 입금/결산 대상 (2026-09-09 피드백) */
export const hasSales = sql`coalesce(${deal.salesAmountNet}, 0) > 0`
export const hasPurchase = sql`coalesce(${deal.purchaseAmountNet}, 0) > 0`

/** 세션 기준 행 단위 범위 조건 (팀장=자기팀, 팀원=본인) */
/** 현재 법인 + 조회 범위 조건 — 거래를 읽는 모든 쿼리의 공통 앞머리 */
async function scopeConds() {
  const entityCond = eq(deal.entity, await getCurrentEntity())
  const user = await getSessionUser()
  if (!user) return [entityCond]
  const scope = await resolveDealScope(user)
  if (scope.kind === 'team')
    return [
      entityCond,
      sql`${deal.ownerUserId} in (select id from users where ${inArray(users.team, scope.teams)})`,
    ]
  if (scope.kind === 'own') return [entityCond, eq(deal.ownerUserId, scope.userId)]
  return [entityCond]
}

export type OverdueDeal = { id: string; dealCode: string; issuerName: string | null; salesDueDate: string; amount: number; ownerName: string | null }

/**
 * 입금예정월이 지났는데 입금 완료가 아닌 거래 (2026-10-08 요청: "귀속월과 입금예정월을 바꿔주세요" 안내).
 * 일이 아니라 월 기준 — 이번 달 1일(한국 시간) 이전 달의 예정일. 보는 사람의 조회 범위를 따른다.
 */
export async function listOverdueSalesDue(): Promise<OverdueDeal[]> {
  const kst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
  const monthStart = `${kst.slice(0, 7)}-01`
  const rows = await db
    .select({
      id: deal.id,
      dealCode: deal.dealCode,
      issuerName: sql<string | null>`(select name from counterparty where id = ${deal.issuerCounterpartyId})`,
      salesDueDate: deal.salesDueDate,
      amount: sql<string>`coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet}, 0)::text`,
      ownerName: users.name,
    })
    .from(deal)
    .leftJoin(users, eq(users.id, deal.ownerUserId))
    .where(
      and(
        isNull(deal.deletedAt),
        ...(await scopeConds()),
        sql`${deal.salesPaidStatus} <> 'completed'`,
        sql`coalesce(${deal.salesAmountNet}, 0) <> 0`,
        sql`${deal.salesDueDate} < ${monthStart}::date`,
      ),
    )
    .orderBy(asc(deal.salesDueDate))
  return rows.map((r) => ({ ...r, salesDueDate: r.salesDueDate!, amount: parseFloat(r.amount) || 0 }))
}

export async function listDeals(f: DealListFilters = {}) {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(5000, Math.max(10, f.pageSize ?? 50))

  const conds = [isNull(deal.deletedAt), ...(await scopeConds())]
  if (f.year) conds.push(eq(deal.accrualYear, f.year))
  if (f.years?.length) conds.push(inArray(deal.accrualYear, f.years))
  if (f.month) conds.push(eq(deal.accrualMonth, f.month))
  if (f.months?.length) conds.push(inArray(deal.accrualMonth, f.months))
  if (f.categoryId) conds.push(eq(deal.categoryId, f.categoryId))
  if (f.categoryIds?.length) conds.push(inArray(deal.categoryId, f.categoryIds))
  if (f.changedOnly) {
    const days = await getChangeHighlightDays()
    conds.push(sql`${deal.id} in (select deal_id from deal_field_change where changed_at >= now() - make_interval(days => ${days}))`)
  }
  if (f.reviewStatuses?.length) conds.push(inArray(deal.reviewStatus, f.reviewStatuses))
  if (f.paidStatuses?.length) {
    const parts = []
    if (f.paidStatuses.includes('unpaid')) parts.push(and(eq(deal.salesPaidStatus, 'pending'), hasSales)!)
    if (f.paidStatuses.includes('unsettled')) parts.push(and(eq(deal.purchasePaidStatus, 'pending'), hasPurchase)!)
    conds.push(or(...parts)!)
  }
  if (f.ownerUserIds?.length) conds.push(inArray(deal.ownerUserId, f.ownerUserIds))
  // 매출/매입 금액이 없는 건은 미입금/미결산으로 치지 않음 (2026-09-09 피드백)
  if (f.paidStatus === 'unpaid') conds.push(eq(deal.salesPaidStatus, 'pending'), hasSales)
  if (f.paidStatus === 'unsettled') conds.push(eq(deal.purchasePaidStatus, 'pending'), hasPurchase)

  if (f.fCode) conds.push(ilike(deal.dealCode, `%${f.fCode.trim()}%`))
  if (f.fIssuer) {
    const like = `%${f.fIssuer.trim()}%`
    conds.push(
      or(
        sql`exists (select 1 from counterparty c where c.id = ${deal.issuerCounterpartyId} and c.name ilike ${like})`,
        ilike(deal.advertiserName, like),
        sql`exists (select 1 from counterparty c where c.id = ${deal.advertiserCounterpartyId} and c.name ilike ${like})`,
      )!,
    )
  }
  if (f.fItem) conds.push(ilike(deal.itemName, `%${f.fItem.trim()}%`))
  if (f.fSupplier)
    conds.push(
      sql`exists (select 1 from counterparty c where c.id = ${deal.supplierCounterpartyId} and c.name ilike ${`%${f.fSupplier.trim()}%`})`,
    )

  const columnConds = [
    numberCond(deal.salesAmountNet, f.fSales),
    numberCond(deal.salesVat, f.fSalesVat),
    numberCond(deal.purchaseAmountNet, f.fPurchase),
    numberCond(deal.purchaseVat, f.fPurchaseVat),
    numberCond(deal.profit, f.fProfit),
    numberCond(deal.salesAmountGross, f.fSalesGross),
    numberCond(deal.purchaseAmountGross, f.fPurchaseGross),
    dateCond([deal.salesInvoiceDate], f.fSalesInvoice),
    dateCond([deal.purchaseInvoiceDate], f.fPurchaseInvoice),
    dateCond([deal.salesDueDate, deal.salesPaidDate], f.fSalesDate),
    dateCond([deal.purchaseDueDate, deal.purchasePaidDate], f.fPurchaseDate),
    dateCond([deal.salesDueDate], f.fSalesDue),
    dateCond([deal.salesPaidDate], f.fSalesPaid),
    purchaseDueCond(f.fPurchaseDue),
    dateCond([deal.purchasePaidDate], f.fPurchasePaid),
  ]
  for (const c of columnConds) if (c) conds.push(c)
  if (f.fPaid === 'paid') conds.push(eq(deal.salesPaidStatus, 'completed'), hasSales)
  if (f.fPaid === 'unpaid') conds.push(sql`${deal.salesPaidStatus} <> 'completed'`, hasSales)
  if (f.fSettled === 'settled') conds.push(eq(deal.purchasePaidStatus, 'completed'), hasPurchase)
  if (f.fSettled === 'unsettled') conds.push(sql`${deal.purchasePaidStatus} <> 'completed'`, hasPurchase)
  if (f.fSalesMethod === '-') conds.push(isNull(deal.salesMethodId))
  else if (f.fSalesMethod && /^\d+$/.test(f.fSalesMethod)) conds.push(eq(deal.salesMethodId, Number(f.fSalesMethod)))

  if (f.q) {
    const like = `%${f.q}%`
    conds.push(
      or(
        ilike(deal.dealCode, like),
        ilike(deal.itemName, like),
        ilike(deal.advertiserName, like),
        sql`exists (select 1 from counterparty c where c.id in (${deal.issuerCounterpartyId}, ${deal.advertiserCounterpartyId}, ${deal.supplierCounterpartyId}) and c.name ilike ${like})`,
      )!,
    )
  }

  const where = and(...conds)

  // 전월 대비: 귀속연월(year+month)이 모두 지정됐을 때만 직전 달과 비교
  let prev: { sales: number; purchase: number } | null = null
  const singleMonth = f.month ?? (f.months?.length === 1 ? f.months[0] : undefined)
  if (f.year && singleMonth) {
    const prevYear = singleMonth === 1 ? f.year - 1 : f.year
    const prevMonth = singleMonth === 1 ? 12 : singleMonth - 1
    const prevConds = [
      isNull(deal.deletedAt),
      ...(await scopeConds()),
      eq(deal.accrualYear, prevYear),
      eq(deal.accrualMonth, prevMonth),
    ]
    if (f.categoryId) prevConds.push(eq(deal.categoryId, f.categoryId))
    if (f.categoryIds?.length) prevConds.push(inArray(deal.categoryId, f.categoryIds))
    if (f.ownerUserIds?.length) prevConds.push(inArray(deal.ownerUserId, f.ownerUserIds))
    const [prevAggr] = await db
      .select({
        sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
        purchase: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      })
      .from(deal)
      .where(and(...prevConds))
    prev = {
      sales: parseFloat(prevAggr.sales),
      purchase: parseFloat(prevAggr.purchase),
    }
  }

  // 카운트
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(deal)
    .where(where)

  // 합계
  const [aggr] = await db
    .select({
      sales: sql<string>`coalesce(sum(${deal.salesAmountNet}), 0)::text`,
      purchase: sql<string>`coalesce(sum(${deal.purchaseAmountNet}), 0)::text`,
      // VAT 포함 합계 (2026-10-06 요청: 카드에 미포함/포함 따로)
      salesGross: sql<string>`coalesce(sum(coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet})), 0)::text`,
      purchaseGross: sql<string>`coalesce(sum(coalesce(${deal.purchaseAmountGross}, ${deal.purchaseAmountNet})), 0)::text`,
      profit: sql<string>`coalesce(sum(${deal.profit}), 0)::text`,
      unpaidCount: sql<number>`(count(*) filter (where ${deal.salesPaidStatus} = 'pending' and ${hasSales}))::int`,
      unpaidAmount: sql<string>`coalesce(sum(${deal.salesAmountNet}) filter (where ${deal.salesPaidStatus} = 'pending' and ${hasSales}), 0)::text`,
    })
    .from(deal)
    .where(where)

  // 목록 (조인)
  const rows = await db
    .select({
      id: deal.id,
      dealCode: deal.dealCode,
      accrualYear: deal.accrualYear,
      accrualMonth: deal.accrualMonth,
      currency: deal.currency,
      status: deal.status,
      itemName: deal.itemName,
      salesAmountNet: deal.salesAmountNet,
      salesVat: deal.salesVat,
      purchaseAmountNet: deal.purchaseAmountNet,
      purchaseVat: deal.purchaseVat,
      // 부가세 포함 금액 — 값이 비어 있으면 공급가+부가세로 보여 줌
      salesAmountGross: sql<string | null>`coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet} + coalesce(${deal.salesVat}, 0))`,
      purchaseAmountGross: sql<string | null>`coalesce(${deal.purchaseAmountGross}, ${deal.purchaseAmountNet} + coalesce(${deal.purchaseVat}, 0))`,
      salesMemo: deal.salesMemo,
      purchaseMemo: deal.purchaseMemo,
      profit: deal.profit,
      profitAdjusted: deal.profitAdjusted,
      profitAdjustMemo: deal.profitAdjustMemo,
      fxRate: deal.fxRate,
      commissionPct: deal.commissionPct,
      commissionAmount: deal.commissionAmount,
      // 추가 성과급 대상자 (2026-10-14)
      incentiveShares: sql<IncentiveShare[]>`coalesce((select json_agg(json_build_object('userId', s.user_id, 'name', u.name, 'rate', s.rate::text) order by s.sort_order, s.id) from deal_incentive_share s join users u on u.id = s.user_id where s.deal_id = ${deal.id}), '[]'::json)`,
      salesPaidStatus: deal.salesPaidStatus,
      purchasePaidStatus: deal.purchasePaidStatus,
      ownerUserId: deal.ownerUserId,
      salesDueDate: deal.salesDueDate,
      salesPaidDate: deal.salesPaidDate,
      salesInvoiceDate: deal.salesInvoiceDate,
      purchaseDueDate: deal.purchaseDueDate,
      purchasePaidDate: deal.purchasePaidDate,
      purchaseInvoiceDate: deal.purchaseInvoiceDate,
      settlementYear: deal.settlementYear,
      settlementMonth: deal.settlementMonth,
      settlementDay: deal.settlementDay,
      categoryName: dealCategory.nameKo,
      salesMethodId: deal.salesMethodId,
      salesMethodName: salesMethod.nameKo,
      reviewStatus: deal.reviewStatus,
      // 매체사 계좌정보 (2026-10-08 요청: 아이콘을 눌러 보고, 내보내기에 포함)
      supplierBankName: supplierCp.bankName,
      supplierAccountNo: supplierCp.accountNo,
      supplierAccountHolder: supplierCp.accountHolder,
      ownerName: users.name,
      ownerEmail: users.email,
      ownerTeam: users.team,
      issuerName: sql<string | null>`(select name from counterparty where id = ${deal.issuerCounterpartyId})`,
      advertiserName: sql<string | null>`coalesce(${deal.advertiserName}, (select name from counterparty where id = ${deal.advertiserCounterpartyId}))`,
      supplierName: supplierCp.name,
    })
    .from(deal)
    .leftJoin(dealCategory, eq(dealCategory.id, deal.categoryId))
    .leftJoin(salesMethod, eq(salesMethod.id, deal.salesMethodId))
    .leftJoin(supplierCp, eq(supplierCp.id, deal.supplierCounterpartyId))
    .leftJoin(users, eq(users.id, deal.ownerUserId))
    .where(where)
    .orderBy(...orderFor(f.sort ?? 'created', f.dir ?? 'desc'))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  // 최근 수정 칸 음영 (2026-09-09 피드백) + 첨부 개수 (2026-09-15)
  const ids = rows.map((r) => r.id)
  const [changes, attachments] = await Promise.all([getRecentChanges(ids), getAttachmentCounts('deal', ids)])

  return {
    rows: rows.map((r) => ({ ...r, recentChanges: changes[r.id], attachmentCount: attachments[r.id] ?? 0 })),
    total,
    page,
    pageSize,
    aggregate: {
      sales: parseFloat(aggr.sales),
      purchase: parseFloat(aggr.purchase),
      salesGross: parseFloat(aggr.salesGross),
      purchaseGross: parseFloat(aggr.purchaseGross),
      profit: parseFloat(aggr.profit),
      unpaidCount: aggr.unpaidCount,
      unpaidAmount: parseFloat(aggr.unpaidAmount),
    },
    prevAggregate: prev,
  }
}

/** 인라인 수정 뒤 그 행만 다시 읽는다 — 목록 전체를 다시 그리지 않으려고 (성능, 2026-10-09) */
export type InlineRow = Awaited<ReturnType<typeof getInlineRow>>
export async function getInlineRow(id: string) {
  const [row] = await db
    .select({
      salesAmountNet: deal.salesAmountNet,
      salesVat: deal.salesVat,
      purchaseAmountNet: deal.purchaseAmountNet,
      purchaseVat: deal.purchaseVat,
      salesAmountGross: sql<string | null>`coalesce(${deal.salesAmountGross}, ${deal.salesAmountNet} + coalesce(${deal.salesVat}, 0))`,
      purchaseAmountGross: sql<string | null>`coalesce(${deal.purchaseAmountGross}, ${deal.purchaseAmountNet} + coalesce(${deal.purchaseVat}, 0))`,
      profit: deal.profit,
      profitAdjusted: deal.profitAdjusted,
      profitAdjustMemo: deal.profitAdjustMemo,
      fxRate: deal.fxRate,
      commissionPct: deal.commissionPct,
      commissionAmount: deal.commissionAmount,
      salesPaidStatus: deal.salesPaidStatus,
      purchasePaidStatus: deal.purchasePaidStatus,
      salesDueDate: deal.salesDueDate,
      salesPaidDate: deal.salesPaidDate,
      salesInvoiceDate: deal.salesInvoiceDate,
      purchaseDueDate: deal.purchaseDueDate,
      purchasePaidDate: deal.purchasePaidDate,
      purchaseInvoiceDate: deal.purchaseInvoiceDate,
      settlementYear: deal.settlementYear,
      settlementMonth: deal.settlementMonth,
      settlementDay: deal.settlementDay,
      accrualYear: deal.accrualYear,
      accrualMonth: deal.accrualMonth,
      reviewStatus: deal.reviewStatus,
      salesMethodId: deal.salesMethodId,
      salesMethodName: salesMethod.nameKo,
    })
    .from(deal)
    .leftJoin(salesMethod, eq(salesMethod.id, deal.salesMethodId))
    .where(eq(deal.id, id))
    .limit(1)
  const changes = await getRecentChanges([id])
  return { ...row!, recentChanges: changes[id] ?? {} }
}

/** 귀속연도 탭용 — 현재 법인에 거래가 있는 연도 (최근 순) */
export async function listDealYears(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ y: deal.accrualYear })
    .from(deal)
    .where(and(isNull(deal.deletedAt), ...(await scopeConds())))
    .orderBy(desc(deal.accrualYear))
  return rows.map((r) => r.y)
}

export async function getDealById(id: string) {
  const [row] = await db
    .select()
    .from(deal)
    .where(and(eq(deal.id, id), isNull(deal.deletedAt), ...(await scopeConds())))
    .limit(1)
  return row ?? null
}
