import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { DealForm } from '@/components/deals/deal-form'
import { getAllLookups } from '@/server/queries/lookups'

export default async function NewDealPage() {
  const lookups = await getAllLookups()
  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <Link
          href="/deals"
          className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />거래 목록
        </Link>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">새 거래 등록</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          거래코드는 비워두면 담당자 prefix + YYMMDD로 자동 채번됩니다
        </p>
      </div>
      <DealForm lookups={lookups} />
    </div>
  )
}
