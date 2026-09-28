import Link from 'next/link'
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { Plus } from 'lucide-react'
import { db } from '@/lib/db/client'
import { counterparty } from '@/lib/db/schema'
import { buttonVariants } from '@/components/ui/button'
import { CsvExportButton } from '@/components/csv-export-button'
import { exportCounterpartiesCsv } from '@/server/actions/export'
import { isClientType } from '@/lib/client-type'
import { CounterpartiesTable } from '@/components/counterparties/counterparties-table'
import { CounterpartiesFilters } from '@/components/counterparties/counterparties-filters'
import { cn } from '@/lib/utils'
import { canCreateCounterparty, canDeleteCounterparty, canViewBankInfo, getSessionUser } from '@/server/auth/guards'

export default async function CounterpartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; noBiz?: string; ctype?: string }>
}) {
  const { q, role, noBiz, ctype } = await searchParams
  const user = await getSessionUser()
  const showBank = user ? canViewBankInfo(user.role) : false
  const conds = [isNull(counterparty.deletedAt), eq(counterparty.isActive, true)]
  if (q)
    conds.push(
      or(
        ilike(counterparty.name, `%${q}%`),
        ilike(counterparty.businessNo, `%${q}%`),
      )!,
    )
  if (role)
    conds.push(sql`${counterparty.roleTags} @> ARRAY[${role}]::text[]`)
  // 거래처 구분 필터 (2026-09-28): 값 또는 'none'(미지정)
  if (ctype === 'none') conds.push(isNull(counterparty.clientType))
  else if (isClientType(ctype)) conds.push(eq(counterparty.clientType, ctype))
  if (noBiz)
    conds.push(
      or(
        isNull(counterparty.businessNo),
        eq(counterparty.businessNo, ''),
      )!,
    )

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: counterparty.id,
        name: counterparty.name,
        businessNo: counterparty.businessNo,
        roleTags: counterparty.roleTags,
        clientType: counterparty.clientType,
        paymentTerm: counterparty.paymentTerm,
        officialFeeRate: counterparty.officialFeeRate,
        bankName: counterparty.bankName,
        accountHolder: counterparty.accountHolder,
        accountNo: counterparty.accountNo,
        memo: counterparty.memo,
      })
      .from(counterparty)
      .where(and(...conds))
      .orderBy(asc(counterparty.name))
      .limit(200),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(counterparty)
      .where(and(...conds)),
  ])

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">거래처</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            매체사·광고주·대행사 통합 마스터
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton
            action={exportCounterpartiesCsv}
            filters={{ q, role, noBiz: Boolean(noBiz) }}
          />
          {user && canCreateCounterparty(user.role) && (
            <Link
              href="/counterparties/new"
              className={cn(buttonVariants(), 'gap-1.5')}
            >
              <Plus className="size-4" />새 거래처
            </Link>
          )}
        </div>
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-4">
          <CounterpartiesFilters initial={{ q, role, noBiz: Boolean(noBiz), ctype }} />
        </div>

        <div className="flex items-center gap-3.5 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
          총 <b className="text-foreground">{total.toLocaleString()}</b>건
          {rows.length < total && <span>· 앞 200건만 표시</span>}
        </div>

        <CounterpartiesTable rows={rows} showBank={showBank} canDelete={user != null && canDeleteCounterparty(user.role)} canEdit={user != null && user.role !== 'viewer'} />
      </section>
    </div>
  )
}
