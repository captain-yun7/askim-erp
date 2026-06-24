import Link from 'next/link'
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { Plus } from 'lucide-react'
import { db } from '@/lib/db/client'
import { counterparty } from '@/lib/db/schema'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CounterpartiesFilters } from '@/components/counterparties/counterparties-filters'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<string, string> = {
  media: '매체사',
  advertiser: '광고주',
  agency: '대행사',
  expense_vendor: '지출처',
}

export default async function CounterpartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; noBiz?: string }>
}) {
  const { q, role, noBiz } = await searchParams
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
        paymentTerm: counterparty.paymentTerm,
        officialFeeRate: counterparty.officialFeeRate,
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
          <h1 className="text-[22px] font-bold tracking-tight">거래처</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            매체사·광고주·대행사 통합 마스터
          </p>
        </div>
        <Link href="/counterparties/new" className={cn(buttonVariants(), 'gap-1.5')}>
          <Plus className="size-4" />새 거래처
        </Link>
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-4">
          <CounterpartiesFilters initial={{ q, role, noBiz: Boolean(noBiz) }} />
        </div>

        <div className="flex items-center gap-3.5 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
          총 <b className="text-foreground">{total.toLocaleString()}</b>건
          {rows.length < total && <span>· 앞 200건만 표시</span>}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>상호명</TableHead>
                <TableHead>사업자번호</TableHead>
                <TableHead>역할</TableHead>
                <TableHead className="text-right">수수료</TableHead>
                <TableHead>결제일</TableHead>
                <TableHead>비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="hover:bg-accent/40">
                  <TableCell>
                    <Link
                      href={`/counterparties/${r.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.businessNo ?? '-'}
                  </TableCell>
                  <TableCell>
                    {r.roleTags.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {r.roleTags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary"
                          >
                            {ROLE_LABEL[t] ?? t}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {r.officialFeeRate ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.paymentTerm ?? '-'}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {r.memo ?? ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
