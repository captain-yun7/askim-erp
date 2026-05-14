import { DealForm } from '@/components/deals/deal-form'
import { getAllLookups } from '@/server/queries/lookups'

export default async function NewDealPage() {
  const lookups = await getAllLookups()
  return (
    <div>
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">새 거래 등록</h1>
        <p className="text-sm text-zinc-500">
          거래코드는 비워두면 담당자 prefix + YYMMDD로 자동 채번됩니다
        </p>
      </div>
      <DealForm lookups={lookups} />
    </div>
  )
}
