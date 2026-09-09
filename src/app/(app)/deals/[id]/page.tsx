import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { DealForm } from '@/components/deals/deal-form'
import { getDealById } from '@/server/queries/deals'
import { getCounterpartyById } from '@/server/queries/counterparties'
import { getAllLookups } from '@/server/queries/lookups'
import { canEditDeal, getSessionUser } from '@/server/auth/guards'
import { getRecentChanges } from '@/server/deal-changes'
import { changeTitle } from '@/lib/change-highlight'
import { getChangeHighlightDays } from '@/server/queries/app-settings'

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const d = await getDealById(id)
  if (!d) notFound()

  const [lookups, issuer, supplier, user] = await Promise.all([
    getAllLookups(),
    d.issuerCounterpartyId ? getCounterpartyById(d.issuerCounterpartyId) : null,
    d.supplierCounterpartyId ? getCounterpartyById(d.supplierCounterpartyId) : null,
    getSessionUser(),
  ])

  const readOnly = !user || !canEditDeal(user, d)
  const [recentAll, highlightDays] = await Promise.all([getRecentChanges([d.id]), getChangeHighlightDays()])
  const recent = recentAll[d.id] ?? {}
  const recentList = Object.entries(recent).sort((a, b) => (a[1].changedAt < b[1].changedAt ? 1 : -1))

  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <Link
          href="/deals"
          className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />거래 목록
        </Link>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">
          거래 수정{' '}
          <span className="font-mono text-base font-medium text-primary">
            {d.dealCode}
          </span>
        </h1>
      </div>
      {recentList.length > 0 && (
        <div className="mx-8 mt-4 flex flex-wrap items-center gap-1.5 rounded-md bg-yellow-100/70 px-3 py-2 text-xs dark:bg-yellow-900/30">
          <span className="mr-1 font-medium">최근 {highlightDays}일 수정</span>
          {recentList.map(([field, c]) => (
            <span key={field} className="rounded-full border border-yellow-300/70 bg-background px-2 py-0.5" title={changeTitle(c)}>
              {FIELD_LABEL[field] ?? field} · {changeTitle(c)}
            </span>
          ))}
        </div>
      )}
      <DealForm
        lookups={lookups}
        readOnly={readOnly}
        initial={
          {
            ...d,
            id: d.id,
            issuerLabel: issuer?.name ?? null,
            supplierLabel: supplier?.name ?? null,
          } as unknown as Parameters<typeof DealForm>[0]['initial']
        }
      />
    </div>
  )
}

const FIELD_LABEL: Record<string, string> = {
  dealCode: '거래코드', accrualYear: '귀속연도', accrualMonth: '귀속월', ownerUserId: '담당자', categoryId: '상품구분', accountId: '계정항목', currency: '통화', status: '상태',
  salesMethodId: '매출수단', issuerCounterpartyId: '발행처', advertiserName: '실광고주', itemName: '품목명', adStart: '광고 시작', adEnd: '광고 종료',
  salesAmountNet: '매출금', salesVat: '매출 부가세', salesAmountGross: '총매출', salesDueDate: '입금예정일', salesPaidDate: '입금일', salesPaidStatus: '입금여부', salesInvoiceDate: '매출 계산서 발행일', salesMemo: '매출 비고',
  supplierCounterpartyId: '매체사', settlementYear: '결산연도', settlementMonth: '결산월', purchasePricingRaw: '수수료',
  purchaseAmountNet: '매입금', purchaseVat: '매입 부가세', purchaseAmountGross: '총매입', purchaseDueDate: '결산예정일', purchasePaidDate: '지급일', purchasePaidStatus: '결산여부', purchaseInvoiceDate: '매입 계산서 발행일', purchaseMemo: '매입 비고',
}
