import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { CounterpartyForm } from '@/components/counterparties/counterparty-form'
import { requireWriter } from '@/server/auth/require-backoffice'

export default async function NewCounterpartyPage() {
  await requireWriter('/counterparties')
  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <Link
          href="/counterparties"
          className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />거래처 목록
        </Link>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">새 거래처</h1>
      </div>
      <CounterpartyForm />
    </div>
  )
}
