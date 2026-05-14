import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { DealsTable } from '@/components/deals/deals-table'
import { DealsFilters } from '@/components/deals/deals-filters'
import { listDeals } from '@/server/queries/deals'
import { getAllLookups } from '@/server/queries/lookups'
import { formatKRWShort } from '@/lib/format'

type SP = { [k: string]: string | string[] | undefined }

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const filters = {
    q: typeof sp.q === 'string' ? sp.q : undefined,
    year: sp.year ? parseInt(String(sp.year), 10) : undefined,
    month: sp.month ? parseInt(String(sp.month), 10) : undefined,
    categoryId: sp.categoryId ? parseInt(String(sp.categoryId), 10) : undefined,
    ownerUserId: typeof sp.owner === 'string' ? sp.owner : undefined,
    paidStatus: sp.paid as 'unpaid' | 'unsettled' | undefined,
    page: sp.page ? parseInt(String(sp.page), 10) : 1,
  }

  const [{ rows, total, page, pageSize, aggregate }, lookups] = await Promise.all([
    listDeals(filters),
    getAllLookups(),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">거래</h1>
          <p className="text-sm text-zinc-500">매출·매입 통합 거래원장</p>
        </div>
        <Link href="/deals/new" className={buttonVariants()}>
          + 새 거래
        </Link>
      </div>

      <div className="border-b px-6 py-3">
        <DealsFilters
          categories={lookups.categories}
          users={lookups.users}
          initial={{
            q: filters.q,
            year: filters.year,
            month: filters.month,
            categoryId: filters.categoryId,
            ownerUserId: filters.ownerUserId,
            paid: filters.paidStatus,
          }}
        />
      </div>

      <div className="flex items-center justify-between border-b bg-zinc-50 px-6 py-2 text-sm">
        <div className="text-zinc-600">
          총 <b className="text-zinc-900">{total.toLocaleString()}</b>건
        </div>
        <div className="flex gap-4 text-zinc-700">
          <span>
            매출 <b>{formatKRWShort(aggregate.sales)}</b>
          </span>
          <span>
            매입 <b>{formatKRWShort(aggregate.purchase)}</b>
          </span>
          <span>
            손익{' '}
            <b className={aggregate.profit < 0 ? 'text-red-600' : 'text-emerald-700'}>
              {formatKRWShort(aggregate.profit)}
            </b>
          </span>
        </div>
      </div>

      <DealsTable rows={rows} />

      <div className="flex items-center justify-between border-t px-6 py-3 text-sm">
        <div className="text-zinc-500">
          {page} / {totalPages} 페이지
        </div>
        <div className="flex gap-2">
          {page > 1 && (
            <PaginationLink page={page - 1} filters={sp}>
              이전
            </PaginationLink>
          )}
          {page < totalPages && (
            <PaginationLink page={page + 1} filters={sp}>
              다음
            </PaginationLink>
          )}
        </div>
      </div>
    </div>
  )
}

function PaginationLink({
  page,
  filters,
  children,
}: {
  page: number
  filters: SP
  children: React.ReactNode
}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (k === 'page') continue
    if (typeof v === 'string' && v) qs.set(k, v)
  }
  qs.set('page', String(page))
  return (
    <Link
      href={`/deals?${qs.toString()}`}
      className="rounded-md border px-3 py-1 hover:bg-zinc-50"
    >
      {children}
    </Link>
  )
}
