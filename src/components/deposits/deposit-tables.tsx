'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatDate, formatKRW } from '@/lib/format'
import {
  deleteDeposit,
  deleteExclusiveContract,
  saveDeposit,
  saveExclusiveContract,
} from '@/server/actions/deposits'
import type { Deposit, ExclusiveContract } from '@/lib/db/schema'

const STATUS_LABEL: Record<string, string> = {
  held: '보유',
  returned: '반환완료',
  offset: '상계예정',
  unreturned: '미반환',
}
const STATUS_TONE: Record<string, string> = {
  held: 'bg-accent text-accent-foreground',
  returned: 'bg-primary/10 text-primary',
  offset: 'bg-muted text-muted-foreground',
  unreturned: 'bg-destructive/10 text-destructive',
}

function useSave() {
  const router = useRouter()
  const [pending, start] = useTransition()
  function run(fn: () => Promise<{ ok?: true; error?: string }>, done?: () => void) {
    start(async () => {
      const res = await fn()
      if (res.error) toast.error(res.error)
      else {
        toast.success('저장되었습니다')
        done?.()
        router.refresh()
      }
    })
  }
  return { pending, run }
}

// ── 보증금현황 ──────────────────────────────────────────
type DepositDraft = {
  counterpartyName: string
  description: string
  ownerName: string
  amount: string
  paidDate: string
  returnedDate: string
  status: string
  memo: string
}

const emptyDeposit: DepositDraft = {
  counterpartyName: '',
  description: '',
  ownerName: '',
  amount: '',
  paidDate: '',
  returnedDate: '',
  status: 'held',
  memo: '',
}

export function DepositTable({ rows, editable }: { rows: Deposit[]; editable: boolean }) {
  const { pending, run } = useSave()
  const [editing, setEditing] = useState<{ id: number | null; draft: DepositDraft } | null>(null)

  function openEdit(r?: Deposit) {
    setEditing(
      r
        ? {
            id: r.id,
            draft: {
              counterpartyName: r.counterpartyName,
              description: r.description ?? '',
              ownerName: r.ownerName ?? '',
              amount: String(parseFloat(r.amount)),
              paidDate: r.paidDate ?? '',
              returnedDate: r.returnedDate ?? '',
              status: r.status,
              memo: r.memo ?? '',
            },
          }
        : { id: null, draft: emptyDeposit },
    )
  }

  function submit() {
    if (!editing) return
    const d = editing.draft
    run(
      () =>
        saveDeposit(editing.id, {
          counterpartyName: d.counterpartyName,
          description: d.description,
          ownerName: d.ownerName,
          amount: Number(d.amount.replace(/,/g, '')) || 0,
          paidDate: d.paidDate || null,
          returnedDate: d.returnedDate || null,
          status: d.status,
          memo: d.memo,
        }),
      () => setEditing(null),
    )
  }

  const set = (patch: Partial<DepositDraft>) =>
    setEditing((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p))

  return (
    <div>
      {editable && (
        <div className="flex justify-end px-4 pt-3">
          <Button size="sm" className="gap-1" onClick={() => openEdit()}>
            <Plus className="size-3.5" />
            보증금 추가
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">No.</TableHead>
              <TableHead>거래처명</TableHead>
              <TableHead>내용</TableHead>
              <TableHead>담당자</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>입금일</TableHead>
              <TableHead>반환일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>비고</TableHead>
              {editable && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{r.counterpartyName}</TableCell>
                <TableCell className="max-w-64 text-[12.5px]">{r.description ?? '-'}</TableCell>
                <TableCell className="text-[12.5px]">{r.ownerName ?? '-'}</TableCell>
                <TableCell className="text-right font-mono text-[12.5px] tabular-nums">
                  {formatKRW(r.amount)}
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums">{formatDate(r.paidDate)}</TableCell>
                <TableCell className="font-mono text-xs tabular-nums">{formatDate(r.returnedDate)}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                      STATUS_TONE[r.status],
                    )}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </TableCell>
                <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={r.memo ?? ''}>
                  {r.memo ?? ''}
                </TableCell>
                {editable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(r)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`'${r.counterpartyName}' 보증금을 삭제할까요?`))
                            run(() => deleteDeposit(r.id))
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id != null ? '보증금 수정' : '보증금 추가'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="거래처명" required>
                <Input value={editing.draft.counterpartyName} onChange={(e) => set({ counterpartyName: e.target.value })} />
              </Field>
              <Field label="담당자">
                <Input value={editing.draft.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
              </Field>
              <Field label="내용" wide>
                <Input value={editing.draft.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
              <Field label="금액" required>
                <Input
                  className="text-right font-mono"
                  inputMode="numeric"
                  value={editing.draft.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                />
              </Field>
              <Field label="상태">
                <select
                  className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                  value={editing.draft.status}
                  onChange={(e) => set({ status: e.target.value })}
                >
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="보증금 입금일">
                <Input type="date" value={editing.draft.paidDate} onChange={(e) => set({ paidDate: e.target.value })} />
              </Field>
              <Field label="보증금 반환일">
                <Input type="date" value={editing.draft.returnedDate} onChange={(e) => set({ returnedDate: e.target.value })} />
              </Field>
              <Field label="비고" wide>
                <Textarea rows={2} value={editing.draft.memo} onChange={(e) => set({ memo: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button onClick={submit} disabled={pending}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── 전속매체 계약사항 ────────────────────────────────────
type ContractDraft = {
  mediaName: string
  mediaType: string
  ownerName: string
  contractPeriod: string
  contractTerms: string
  hasMonthlyFee: string
  depositPaidDate: string
  depositReturnedDate: string
  memo: string
}

const emptyContract: ContractDraft = {
  mediaName: '',
  mediaType: '',
  ownerName: '',
  contractPeriod: '',
  contractTerms: '',
  hasMonthlyFee: '',
  depositPaidDate: '',
  depositReturnedDate: '',
  memo: '',
}

export function ContractTable({ rows, editable }: { rows: ExclusiveContract[]; editable: boolean }) {
  const { pending, run } = useSave()
  const [editing, setEditing] = useState<{ id: number | null; draft: ContractDraft } | null>(null)

  function openEdit(r?: ExclusiveContract) {
    setEditing(
      r
        ? {
            id: r.id,
            draft: {
              mediaName: r.mediaName,
              mediaType: r.mediaType ?? '',
              ownerName: r.ownerName ?? '',
              contractPeriod: r.contractPeriod ?? '',
              contractTerms: r.contractTerms ?? '',
              hasMonthlyFee: r.hasMonthlyFee ?? '',
              depositPaidDate: r.depositPaidDate ?? '',
              depositReturnedDate: r.depositReturnedDate ?? '',
              memo: r.memo ?? '',
            },
          }
        : { id: null, draft: emptyContract },
    )
  }

  function submit() {
    if (!editing) return
    const d = editing.draft
    run(
      () =>
        saveExclusiveContract(editing.id, {
          ...d,
          hasMonthlyFee: d.hasMonthlyFee === 'O' || d.hasMonthlyFee === 'X' ? d.hasMonthlyFee : null,
          depositPaidDate: d.depositPaidDate || null,
          depositReturnedDate: d.depositReturnedDate || null,
        }),
      () => setEditing(null),
    )
  }

  const set = (patch: Partial<ContractDraft>) =>
    setEditing((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p))

  return (
    <div>
      {editable && (
        <div className="flex justify-end px-4 pt-3">
          <Button size="sm" className="gap-1" onClick={() => openEdit()}>
            <Plus className="size-3.5" />
            계약 추가
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">No.</TableHead>
              <TableHead>매체명</TableHead>
              <TableHead>매체종류</TableHead>
              <TableHead>담당자</TableHead>
              <TableHead>계약기간</TableHead>
              <TableHead>계약내용</TableHead>
              <TableHead className="text-center">월 고정비</TableHead>
              <TableHead>보증금 입금일</TableHead>
              <TableHead>보증금 반환일</TableHead>
              <TableHead>비고</TableHead>
              {editable && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{r.mediaName}</TableCell>
                <TableCell className="text-[12.5px]">{r.mediaType ?? '-'}</TableCell>
                <TableCell className="text-[12.5px]">{r.ownerName ?? '-'}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                  {r.contractPeriod ?? '-'}
                </TableCell>
                <TableCell className="max-w-72 text-[12.5px]">{r.contractTerms ?? '-'}</TableCell>
                <TableCell className="text-center">
                  {r.hasMonthlyFee ? (
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                        r.hasMonthlyFee === 'O'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {r.hasMonthlyFee}
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums">{formatDate(r.depositPaidDate)}</TableCell>
                <TableCell className="font-mono text-xs tabular-nums">{formatDate(r.depositReturnedDate)}</TableCell>
                <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={r.memo ?? ''}>
                  {r.memo ?? ''}
                </TableCell>
                {editable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(r)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`'${r.mediaName}' 계약을 삭제할까요?`))
                            run(() => deleteExclusiveContract(r.id))
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id != null ? '계약 수정' : '계약 추가'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="매체명" required>
                <Input value={editing.draft.mediaName} onChange={(e) => set({ mediaName: e.target.value })} />
              </Field>
              <Field label="매체종류">
                <Input
                  value={editing.draft.mediaType}
                  placeholder="외벽(성수) / 팬클럽 ..."
                  onChange={(e) => set({ mediaType: e.target.value })}
                />
              </Field>
              <Field label="담당자">
                <Input value={editing.draft.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
              </Field>
              <Field label="계약기간">
                <Input
                  value={editing.draft.contractPeriod}
                  placeholder="2026.01.01~2027.12.31"
                  onChange={(e) => set({ contractPeriod: e.target.value })}
                />
              </Field>
              <Field label="계약내용" wide>
                <Textarea rows={2} value={editing.draft.contractTerms} onChange={(e) => set({ contractTerms: e.target.value })} />
              </Field>
              <Field label="월 고정비 여부">
                <select
                  className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                  value={editing.draft.hasMonthlyFee}
                  onChange={(e) => set({ hasMonthlyFee: e.target.value })}
                >
                  <option value="">-</option>
                  <option value="O">O</option>
                  <option value="X">X</option>
                </select>
              </Field>
              <div />
              <Field label="보증금 입금일">
                <Input type="date" value={editing.draft.depositPaidDate} onChange={(e) => set({ depositPaidDate: e.target.value })} />
              </Field>
              <Field label="보증금 반환일">
                <Input type="date" value={editing.draft.depositReturnedDate} onChange={(e) => set({ depositReturnedDate: e.target.value })} />
              </Field>
              <Field label="비고" wide>
                <Textarea rows={2} value={editing.draft.memo} onChange={(e) => set({ memo: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button onClick={submit} disabled={pending}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({
  label,
  required,
  wide,
  children,
}: {
  label: string
  required?: boolean
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid gap-1.5', wide && 'col-span-2')}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  )
}
