'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AmountInput, truncAmount } from '@/components/ui/amount-input'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatDate, formatKRW } from '@/lib/format'
import { deleteEmployee, saveEmployee } from '@/server/actions/employees'

type Row = {
  id: number
  name: string
  position: string | null
  birthCode: string | null
  department: string | null
  hireDate: string | null
  annualSalary: string | null
  monthlySalary: string | null
  incentive: string | null
  leaveDate: string | null
  pensionYear: number | null
  memo: string | null
}

type Draft = {
  name: string
  position: string
  birthCode: string
  department: string
  hireDate: string
  annualSalary: string
  monthlySalary: string
  incentive: string
  leaveDate: string
  pensionYear: string
  memo: string
}

const EMPTY: Draft = { name: '', position: '', birthCode: '', department: '', hireDate: '', annualSalary: '', monthlySalary: '', incentive: '', leaveDate: '', pensionYear: '', memo: '' }

const toDraft = (r: Row): Draft => ({
  name: r.name,
  position: r.position ?? '',
  birthCode: r.birthCode ?? '',
  department: r.department ?? '',
  hireDate: r.hireDate ?? '',
  annualSalary: r.annualSalary ?? '',
  monthlySalary: r.monthlySalary ?? '',
  incentive: r.incentive ?? '',
  leaveDate: r.leaveDate ?? '',
  pensionYear: r.pensionYear != null ? String(r.pensionYear) : '',
  memo: r.memo ?? '',
})

const num = (v: string | null) => (v ? parseFloat(v) || 0 : 0)

export function EmployeeTable({ rows, today }: { rows: Row[]; today: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null)
  const [showLeft, setShowLeft] = useState(true)

  const hasLeft = (r: Row) => r.leaveDate != null && r.leaveDate <= today
  const active = rows.filter((r) => !hasLeft(r))
  const shown = showLeft ? rows : active

  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))

  function submit() {
    if (!editing) return
    const d = editing.draft
    if (!d.name.trim()) {
      toast.error('성함을 입력하세요')
      return
    }
    start(async () => {
      const res = await saveEmployee(editing.id, {
        ...d,
        hireDate: d.hireDate || null,
        leaveDate: d.leaveDate || null,
        annualSalary: d.annualSalary === '' ? null : d.annualSalary,
        monthlySalary: d.monthlySalary === '' ? null : d.monthlySalary,
        pensionYear: d.pensionYear === '' ? null : d.pensionYear,
      })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('저장되었습니다')
      setEditing(null)
      router.refresh()
    })
  }

  function remove(r: Row) {
    if (!confirm(`'${r.name}' 인사 정보를 삭제할까요?\n\n퇴사 처리는 삭제가 아니라 퇴사일을 입력해 주세요.`)) return
    start(async () => {
      const res = await deleteEmployee(r.id)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('삭제되었습니다')
      router.refresh()
    })
  }

  return (
    <>
      <section className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Stat label="재직 인원" value={`${active.length}명`} sub={`퇴사 ${rows.length - active.length}명 포함 전체 ${rows.length}명`} />
        <Stat label="연봉 합계 (재직)" value={`₩ ${formatKRW(active.reduce((s, r) => s + num(r.annualSalary), 0))}`} sub="기본급 기준" />
        <Stat label="월급여 합계 (재직)" value={`₩ ${formatKRW(active.reduce((s, r) => s + num(r.monthlySalary), 0))}`} sub="인센티브 제외" />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card" data-slot="hr-table">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} />
            퇴사자도 표시
          </label>
          <Button size="sm" className="gap-1.5" onClick={() => setEditing({ id: null, draft: EMPTY })}>
            <Plus className="size-4" />
            구성원 추가
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">No.</TableHead>
                <TableHead>성함</TableHead>
                <TableHead>직급</TableHead>
                <TableHead>주민번호</TableHead>
                <TableHead>부서</TableHead>
                <TableHead>입사일</TableHead>
                <TableHead className="text-right">기본급(연봉)</TableHead>
                <TableHead className="text-right">월급여</TableHead>
                <TableHead>인센티브</TableHead>
                <TableHead>퇴사일</TableHead>
                <TableHead>퇴직연금<br />가입연도</TableHead>
                <TableHead>비고</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="py-14 text-center text-sm text-muted-foreground">
                    등록된 구성원이 없습니다. 오른쪽 위 &quot;구성원 추가&quot;로 입력하세요.
                  </TableCell>
                </TableRow>
              )}
              {shown.map((r, i) => (
                <TableRow key={r.id} data-left={hasLeft(r) || undefined} className={cn(hasLeft(r) && 'text-muted-foreground')}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-[12.5px]">{r.position ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{r.birthCode ?? '-'}</TableCell>
                  <TableCell className="text-[12.5px]">{r.department ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{formatDate(r.hireDate)}</TableCell>
                  <TableCell className="text-right font-mono text-[12.5px] tabular-nums">{formatKRW(r.annualSalary)}</TableCell>
                  <TableCell className="text-right font-mono text-[12.5px] tabular-nums">{formatKRW(r.monthlySalary)}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal text-xs leading-snug">{r.incentive ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{formatDate(r.leaveDate)}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{r.pensionYear ?? '-'}</TableCell>
                  <TableCell className="text-xs">{r.memo ?? ''}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-7" aria-label={`${r.name} 수정`} title="수정" onClick={() => setEditing({ id: r.id, draft: toDraft(r) })}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`${r.name} 삭제`} title="삭제" disabled={pending} onClick={() => remove(r)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id != null ? '구성원 수정' : '구성원 추가'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="성함" required>
                <Input aria-label="성함" value={editing.draft.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="직급">
                <Input aria-label="직급" value={editing.draft.position} onChange={(e) => set({ position: e.target.value })} />
              </Field>
              <Field label="주민번호 (앞자리)">
                <Input aria-label="주민번호" value={editing.draft.birthCode} onChange={(e) => set({ birthCode: e.target.value })} placeholder="예) 900101" />
              </Field>
              <Field label="부서">
                <Input aria-label="부서" value={editing.draft.department} onChange={(e) => set({ department: e.target.value })} />
              </Field>
              <Field label="입사일">
                <DateInput aria-label="입사일" value={editing.draft.hireDate} onChange={(v) => set({ hireDate: v ?? '' })} />
              </Field>
              <Field label="퇴사일">
                <DateInput aria-label="퇴사일" value={editing.draft.leaveDate} onChange={(v) => set({ leaveDate: v ?? '' })} />
              </Field>
              <Field label="기본급(연봉)">
                <AmountInput
                  aria-label="기본급(연봉)"
                  integer
                  className="text-right font-mono"
                  value={editing.draft.annualSalary}
                  // 연봉을 넣으면 월급여를 12로 나눠 채운다 (반올림). 월급여는 따로 고칠 수 있다
                  onChange={(v) => set({ annualSalary: v ?? '', monthlySalary: v ? String(Math.round(Number(truncAmount(v)) / 12)) : '' })}
                />
              </Field>
              <Field label="월급여">
                <AmountInput aria-label="월급여" integer className="text-right font-mono" value={editing.draft.monthlySalary} onChange={(v) => set({ monthlySalary: v ?? '' })} />
              </Field>
              <Field label="인센티브" wide>
                <Textarea aria-label="인센티브" rows={2} value={editing.draft.incentive} onChange={(e) => set({ incentive: e.target.value })} />
              </Field>
              <Field label="퇴직연금 가입연도">
                <Input aria-label="퇴직연금 가입연도" inputMode="numeric" value={editing.draft.pensionYear} onChange={(e) => set({ pensionYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="예) 2026" />
              </Field>
              <Field label="비고">
                <Input aria-label="비고" value={editing.draft.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="정규직 / 프리랜서" />
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
    </>
  )
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('grid gap-1.5', wide && 'col-span-2')}>
      <Label className={cn('gap-1', required && "after:text-destructive after:content-['*']")}>{label}</Label>
      {children}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-3 text-[23px] font-medium tracking-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  )
}
