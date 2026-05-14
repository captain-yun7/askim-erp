import Link from 'next/link'
import { and, asc, eq, ilike, isNull, sql } from 'drizzle-orm'
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
    <div>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">거래처</h1>
          <p className="text-sm text-zinc-500">매체사·광고주·대행사 통합 마스터</p>
        </div>
        <Link href="/counterparties/new" className={buttonVariants()}>
          + 새 거래처
        </Link>
      </div>

      <form className="border-b px-6 py-3">
        <Input
          name="q"
          defaultValue={q ?? ''}
          placeholder="상호명, 사업자번호 검색..."
          className="max-w-sm"
        />
      </form>

      <div className="border-b bg-zinc-50 px-6 py-2 text-sm text-zinc-600">
        총 <b className="text-zinc-900">{total.toLocaleString()}</b>건
        {rows.length < total && <span> (앞 200건만 표시)</span>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>상호명</TableHead>
            <TableHead>사업자번호</TableHead>
            <TableHead>종목</TableHead>
            <TableHead>수수료</TableHead>
            <TableHead>결제일</TableHead>
            <TableHead>비고</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="hover:bg-zinc-50">
              <TableCell>
                <Link
                  href={`/counterparties/${r.id}`}
                  className="text-blue-700 hover:underline"
                >
                  {r.name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.businessNo ?? '-'}
              </TableCell>
              <TableCell className="text-xs">{r.businessCategory ?? '-'}</TableCell>
              <TableCell className="text-xs">{r.officialFeeRate ?? '-'}</TableCell>
              <TableCell className="text-xs">{r.paymentTerm ?? '-'}</TableCell>
              <TableCell className="max-w-xs truncate text-xs text-zinc-500">
                {r.memo ?? ''}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
