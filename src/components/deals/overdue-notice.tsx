'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatKRW } from '@/lib/format'
import type { OverdueDeal } from '@/server/queries/deals'

/**
 * 입금예정월이 지났는데 입금 완료가 아닌 거래 안내 (2026-10-08 요청).
 * 거래 화면 위쪽에 안내 띠가 수정할 때까지 계속 보이고, "목록 보기"를 누르면 창으로 전체 목록을 본다.
 */
export function OverdueNotice({ deals }: { deals: OverdueDeal[] }) {
  // 목록 창은 "목록 보기"를 눌렀을 때만 — 들어올 때마다 화면을 가리면 거래 작업을 막는다. 상단 띠가 수정할 때까지 계속 보인다
  const [open, setOpen] = useState(false)
  if (deals.length === 0) return null
  const list = (
    <ul className="max-h-64 overflow-auto rounded-lg border bg-background text-[12.5px]" data-slot="overdue-list">
      {deals.map((d) => (
        <li key={d.id} className="flex items-center gap-3 border-b px-3 py-1.5 last:border-0">
          <Link href={`/deals/${d.id}`} className="font-medium text-sky-800 underline underline-offset-4">
            {d.dealCode}
          </Link>
          <span className="truncate text-muted-foreground">{d.issuerName ?? '-'}</span>
          <span className="ml-auto whitespace-nowrap font-mono tabular-nums">입금예정 {d.salesDueDate.slice(0, 7)}</span>
          <span className="whitespace-nowrap font-mono tabular-nums">₩ {formatKRW(Math.round(d.amount))}</span>
          {d.ownerName && <span className="whitespace-nowrap text-muted-foreground">{d.ownerName}</span>}
        </li>
      ))}
    </ul>
  )
  return (
    <>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900" data-slot="overdue-banner">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <b>입금예정월이 지난 미입금 거래 {deals.length}건</b> — 귀속월과 입금예정월을 바꿔 주세요.
          <span className="ml-2 text-amber-800/80">{deals.slice(0, 6).map((d) => d.dealCode).join(', ')}{deals.length > 6 ? ` 외 ${deals.length - 6}건` : ''}</span>
        </div>
        <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => setOpen(true)}>
          목록 보기
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl" data-overdue-dialog>
          <DialogHeader>
            <DialogTitle>귀속월과 입금예정월을 바꿔 주세요</DialogTitle>
            <DialogDescription>
              입금예정월이 지났는데 아직 입금 완료가 아닌 거래 {deals.length}건입니다. 거래를 열어 귀속월·입금예정일을 고치거나 입금 완료로 바꾸기 전까지 위쪽 안내가 계속 보입니다.
            </DialogDescription>
          </DialogHeader>
          {list}
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
