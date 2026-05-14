import { CounterpartyForm } from '@/components/counterparties/counterparty-form'

export default function NewCounterpartyPage() {
  return (
    <div>
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">새 거래처</h1>
      </div>
      <CounterpartyForm />
    </div>
  )
}
