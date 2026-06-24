import Link from 'next/link'
import { and, asc, eq, ilike, isNull, sql } from 'drizzle-orm'
import { Plus, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default async function CounterpartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const conds = [isNull(counterparty.deletedAt), eq(counterparty.isActive, true)]
  if (q) conds.push(ilike(counterparty.name, `%${q}%`))

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: counterparty.id,
        name: counterparty.name,
        businessNo: counterparty.businessNo,
        businessCategory: counterparty.businessCategory,
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
        <form className="border-b p-4">
          <div className="relative min-w-56 max-w-sm">
            <Search className="absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q ?? ''}
              placeholder="상호명, 사업자번호 검색..."
              className="h-9 rounded-lg pl-9"
            />
          </div>
        </form>

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
                <TableHead>종목</TableHead>
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
                    {r.businessCategory ? (
                      <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {r.businessCategory}
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
