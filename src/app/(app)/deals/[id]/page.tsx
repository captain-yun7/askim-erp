import { notFound } from 'next/navigation'
import { DealForm } from '@/components/deals/deal-form'
import { getDealById } from '@/server/queries/deals'
import { getCounterpartyById } from '@/server/queries/counterparties'
import { getAllLookups } from '@/server/queries/lookups'

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const d = await getDealById(id)
  if (!d) notFound()

  const [lookups, issuer, advertiser, supplier] = await Promise.all([
    getAllLookups(),
    d.issuerCounterpartyId ? getCounterpartyById(d.issuerCounterpartyId) : null,
    d.advertiserCounterpartyId ? getCounterpartyById(d.advertiserCounterpartyId) : null,
    d.supplierCounterpartyId ? getCounterpartyById(d.supplierCounterpartyId) : null,
  ])

  return (
    <div>
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">
          거래 수정 <span className="font-mono text-base text-zinc-500">{d.dealCode}</span>
        </h1>
      </div>
      <DealForm
        lookups={lookups}
        initial={
          {
            ...d,
            id: d.id,
            issuerLabel: issuer?.name ?? null,
            advertiserLabel: advertiser?.name ?? null,
            supplierLabel: supplier?.name ?? null,
          } as unknown as Parameters<typeof DealForm>[0]['initial']
        }
      />
    </div>
  )
}
