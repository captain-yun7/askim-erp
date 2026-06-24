import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ExpenseForm } from '@/components/expenses/expense-form'
import { getAllLookups } from '@/server/queries/lookups'

export default async function NewExpensePage() {
  const lookups = await getAllLookups()
  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <Link
          href="/expenses"
          className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />판관비 목록
        </Link>
        <h1 className="text-[22px] font-bold tracking-tight">판관비 입력</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          여러 영수증을 표 형태로 한 번에 입력하세요
        </p>
      </div>
      <ExpenseForm
        lookups={{
          expenseCategories: lookups.expenseCategories,
          users: lookups.users,
        }}
      />
    </div>
  )
}
