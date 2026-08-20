import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { CounterpartyForm } from '@/components/counterparties/counterparty-form'
import { getCounterpartyById } from '@/server/queries/counterparties'

export default async function EditCounterpartyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cp = await getCounterpartyById(id)
  if (!cp) notFound()
  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <Link
          href="/counterparties"
          className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />거래처 목록
        </Link>
        <h1 className="text-[22px] font-bold tracking-tight">거래처 수정</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{cp.name}</p>
      </div>
      <CounterpartyForm
        initial={{
          id: cp.id,
          name: cp.name,
          businessNo: cp.businessNo,
          ceo: cp.ceo,
          address: cp.address,
          businessType: cp.businessType,
          businessCategory: cp.businessCategory,
          phone: cp.phone,
          email: cp.email,
          contactPerson: cp.contactPerson,
          bankAccountRaw: cp.bankAccountRaw,
          bankName: cp.bankName,
          accountNo: cp.accountNo,
          accountHolder: cp.accountHolder,
          officialFeeRate: cp.officialFeeRate,
          unofficialFeeRate: cp.unofficialFeeRate,
          paymentTerm: cp.paymentTerm,
          memo: cp.memo,
          roleTags: cp.roleTags,
        }}
      />
    </div>
  )
}
