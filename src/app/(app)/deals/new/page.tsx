import { ListBackLink } from '@/components/list-return'
import { ChevronLeft, Copy } from 'lucide-react'
import { DealForm } from '@/components/deals/deal-form'
import { getCurrentEntity } from '@/server/entity'
import { entityInfo } from '@/lib/entity'
import { getAllLookups } from '@/server/queries/lookups'
import { getDealById } from '@/server/queries/deals'
import { getCounterpartyById } from '@/server/queries/counterparties'
import { requireWriter } from '@/server/auth/require-backoffice'

/**
 * 새 거래 등록. `?copy=<거래 id>` 면 그 거래 내용을 채운 채로 연다 (2026-09-16 피드백: 거래 복사).
 * 거래코드는 비워 두고(직접 입력), 날짜·입금/결산 상태는 복사하지 않는다.
 */
export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  await requireWriter('/deals')
  const { copy } = await searchParams
  const isUuid = typeof copy === 'string' && /^[0-9a-f-]{36}$/i.test(copy)
  const [lookups, source, entity] = await Promise.all([getAllLookups(), isUuid ? getDealById(copy) : null, getCurrentEntity()])
  const ent = entityInfo(entity)
  const [issuer, supplier] = source
    ? await Promise.all([
        source.issuerCounterpartyId ? getCounterpartyById(source.issuerCounterpartyId, { includeDeleted: true }) : null,
        source.supplierCounterpartyId ? getCounterpartyById(source.supplierCounterpartyId, { includeDeleted: true }) : null,
      ])
    : [null, null]

  const initial = source
    ? {
        accrualYear: source.accrualYear,
        accrualMonth: source.accrualMonth,
        ownerUserId: source.ownerUserId,
        categoryId: source.categoryId,
        accountId: source.accountId,
        currency: source.currency,
        salesMethodId: source.salesMethodId,
        issuerCounterpartyId: source.issuerCounterpartyId,
        advertiserCounterpartyId: source.advertiserCounterpartyId,
        advertiserName: source.advertiserName,
        itemName: source.itemName,
        salesAmountNet: source.salesAmountNet,
        salesVat: source.salesVat,
        salesAmountGross: source.salesAmountGross,
        salesMemo: source.salesMemo,
        supplierCounterpartyId: source.supplierCounterpartyId,
        purchasePricingRaw: source.purchasePricingRaw,
        purchaseAmountNet: source.purchaseAmountNet,
        purchaseVat: source.purchaseVat,
        purchaseAmountGross: source.purchaseAmountGross,
        purchaseMemo: source.purchaseMemo,
        issuerLabel: issuer?.name ?? null,
        supplierLabel: supplier?.name ?? null,
      }
    : undefined

  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <ListBackLink path="/deals"
          className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />거래 목록
        </ListBackLink>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">새 거래 등록</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          거래코드는 직접 입력합니다 · 이미 있는 코드는 입력 즉시 알려 드립니다
        </p>
      </div>
      {source && (
        <div data-slot="copy-banner" className="mx-8 mt-4 flex items-center gap-2 rounded-md bg-info px-3 py-2 text-xs text-info-foreground">
          <Copy className="size-3.5" />
          <span>
            <b className="font-medium">{source.dealCode}</b> 복사본입니다. 새 거래코드를 입력해 저장하세요 — 날짜와 입금·결산 상태는 복사되지 않았으니 확인 후 입력하세요.
          </span>
        </div>
      )}
      <DealForm lookups={lookups} foreign={!ent.hasVat} defaultCurrency={ent.currency} initial={initial as unknown as Parameters<typeof DealForm>[0]['initial']} />
    </div>
  )
}
