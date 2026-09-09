import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { DealForm } from '@/components/deals/deal-form'
import { getDealById } from '@/server/queries/deals'
import { getCounterpartyById } from '@/server/queries/counterparties'
import { getAllLookups } from '@/server/queries/lookups'
import { canEditDeal, getSessionUser } from '@/server/auth/guards'

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
