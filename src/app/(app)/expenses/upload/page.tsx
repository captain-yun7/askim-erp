import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ExpenseUploadForm } from '@/components/expenses/expense-upload-form'
import { getAllLookups } from '@/server/queries/lookups'
import { requireBackoffice, requireWriter } from '@/server/auth/require-backoffice'

export default async function ExpenseUploadPage() {
  await requireBackoffice()
  await requireWriter('/expenses')
  const lookups = await getAllLookups()
  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <Link href="/expenses" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" />판관비 목록
        </Link>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">판관비 엑셀 업로드</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          양식대로 작성한 엑셀을 올리면 미리보기 후 한 번에 등록합니다 ·{' '}
          <a href="/templates/expense-upload-template.xlsx" className="underline underline-offset-2 hover:text-foreground" download>
            양식 다운로드
          </a>
        </p>
      </div>
      <ExpenseUploadForm categories={lookups.expenseCategories} />
    </div>
  )
}
