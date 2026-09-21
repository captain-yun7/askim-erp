'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { deleteCounterparties } from '@/server/actions/counterparties'

const ROLE_LABEL: Record<string, string> = {
  media: '매체사',
  advertiser: '광고주',
  agency: '대행사',
  expense_vendor: '지출처',
}

export type CounterpartyRow = {
  id: string
  name: string
  businessNo: string | null
  roleTags: string[]
  paymentTerm: string | null
  officialFeeRate: string | null
  bankName: string | null
  accountHolder: string | null
  accountNo: string | null
  memo: string | null
}

/** 거래처 목록 — 체크박스로 여러 건 삭제 (2026-09-16 피드백) */
export function CounterpartiesTable({ rows, showBank, canDelete }: { rows: CounterpartyRow[]; showBank: boolean; canDelete: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  // 목록이 바뀌면(검색·삭제) 화면에 없는 선택은 버림
  const visible = rows.filter((r) => selected.has(r.id))
  const allChecked = rows.length > 0 && visible.length === rows.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function removeSelected() {
    if (visible.length === 0) return
    const preview = visible.slice(0, 5).map((r) => `· ${r.name}`).join('\n')
    const more = visible.length > 5 ? `\n…외 ${visible.length - 5}건` : ''
    if (!confirm(`거래처 ${visible.length}건을 삭제하시겠습니까?\n\n${preview}${more}\n\n목록과 검색에서 사라집니다. 이미 등록된 거래에 적힌 거래처명은 그대로 남습니다.`)) return
    start(async () => {
      const res = await deleteCounterparties(visible.map((r) => r.id))
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(`거래처 ${res.deleted}건을 삭제했습니다`)
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <>
      {canDelete && visible.length > 0 && (
        <div data-slot="bulk-bar" className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-[12.5px]">
          <span>
            <b>{visible.length}</b>건 선택
          </span>
          <Button size="sm" variant="destructive" className="h-7 gap-1.5" disabled={pending} onClick={removeSelected}>
            <Trash2 className="size-3.5" />
            {pending ? '삭제 중...' : '선택 삭제'}
          </Button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
            선택 해제
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {canDelete && (
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    aria-label="전체 선택"
                    checked={allChecked}
                    onCheckedChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </TableHead>
              )}
              <TableHead>상호명</TableHead>
              <TableHead>사업자번호</TableHead>
              <TableHead>역할</TableHead>
              {showBank && (
                <>
                  <TableHead>거래은행</TableHead>
                  <TableHead>예금주</TableHead>
                  <TableHead>계좌번호</TableHead>
                </>
              )}
              <TableHead className="text-right">수수료</TableHead>
              <TableHead>결제일</TableHead>
              <TableHead>비고</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/60" data-state={selected.has(r.id) ? 'selected' : undefined}>
                {canDelete && (
                  <TableCell className="pl-4">
                    <Checkbox aria-label={`${r.name} 선택`} checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/counterparties/${r.id}`} className="font-medium text-primary hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.businessNo ?? '-'}</TableCell>
                <TableCell>
                  {r.roleTags.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {r.roleTags.map((t) => (
                        <span key={t} className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">
                          {ROLE_LABEL[t] ?? t}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                {showBank && (
                  <>
                    <TableCell className="text-xs">{r.bankName ?? '-'}</TableCell>
                    <TableCell className="text-xs">{r.accountHolder ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{r.accountNo ?? '-'}</TableCell>
                  </>
                )}
                <TableCell className="text-right font-mono text-xs tabular-nums">{r.officialFeeRate ?? '-'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.paymentTerm ?? '-'}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{r.memo ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
