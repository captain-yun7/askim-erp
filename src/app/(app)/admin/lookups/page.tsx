import { redirect } from 'next/navigation'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  account,
  dealCategory,
  expenseCategory,
  salesMethod,
} from '@/lib/db/schema'
import {
  DealCategoryEditor,
  ExpenseCategoryEditor,
  SimpleLookupEditor,
} from '@/components/admin/lookup-editor'
import {
  updateAccount,
  updateDealCategory,
  updateExpenseCategory,
  updateSalesMethod,
} from '@/server/actions/lookups-admin'
import { canManageLookups, getSessionUser } from '@/server/auth/guards'

function Section({
  title,
  desc,
  children,
}: {
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {children}
    </section>
  )
}

export default async function AdminLookupsPage() {
  const user = await getSessionUser()
  if (!user || !canManageLookups(user.role)) redirect('/')

  const [cats, accs, sms, expCats] = await Promise.all([
    db.select().from(dealCategory).orderBy(asc(dealCategory.displayOrder)),
    db.select().from(account).orderBy(asc(account.displayOrder)),
    db.select().from(salesMethod).orderBy(asc(salesMethod.displayOrder)),
    db
      .select()
      .from(expenseCategory)
      .orderBy(asc(expenseCategory.displayOrder)),
  ])

  return (
    <div className="flex flex-col gap-5 px-8 pb-8 pt-6">
      <div>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">Lookup 마스터</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          상품구분·계정항목·매출수단·거래항목 기준정보 관리
        </p>
      </div>

      <Section title="상품구분" desc="인센티브 룰 기준 · 성과급 요율 포함">
        <DealCategoryEditor
          rows={cats.map((c) => ({
            id: c.id,
            code: c.code,
            nameKo: c.nameKo,
            commissionRate: c.commissionRate,
            displayOrder: c.displayOrder,
            memo: c.memo,
            planGroup: c.planGroup,
          }))}
          action={updateDealCategory}
        />
      </Section>

      <Section title="계정항목" desc="광고비·제작비·보증금 등">
        <SimpleLookupEditor
          rows={accs.map((a) => ({
            id: a.id,
            code: a.code,
            nameKo: a.nameKo,
            displayOrder: a.displayOrder,
          }))}
          action={updateAccount}
        />
      </Section>

      <Section title="매출수단" desc="세금계산서·현금영수증·카드 등">
        <SimpleLookupEditor
          rows={sms.map((s) => ({
            id: s.id,
            code: s.code,
            nameKo: s.nameKo,
            displayOrder: s.displayOrder,
          }))}
          action={updateSalesMethod}
        />
      </Section>

      <Section title="거래항목 (판관비)" desc="식대·교통·지급수수료 등">
        <ExpenseCategoryEditor
          rows={expCats.map((e) => ({
            id: e.id,
            code: e.code,
            nameKo: e.nameKo,
            costGroup: e.costGroup,
            displayOrder: e.displayOrder,
          }))}
          action={updateExpenseCategory}
        />
      </Section>
    </div>
  )
}
