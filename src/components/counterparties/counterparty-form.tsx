'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createCounterparty,
  deleteCounterparty,
  updateCounterparty,
  type CounterpartyInput,
} from '@/server/actions/counterparties'

export function CounterpartyForm({
  initial,
  readOnly = false,
  canDelete = true,
}: {
  initial?: Partial<CounterpartyInput> & { id?: string }
  /** 조회 전용(viewer, 남의 등록건 영업) */
  readOnly?: boolean
  /** 비활성화 버튼 노출 (회계/admin) */
  canDelete?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    businessNo: initial?.businessNo ?? '',
    ceo: initial?.ceo ?? '',
    address: initial?.address ?? '',
    businessType: initial?.businessType ?? '',
    businessCategory: initial?.businessCategory ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    contactPerson: initial?.contactPerson ?? '',
    bankAccountRaw: initial?.bankAccountRaw ?? '',
    bankName: initial?.bankName ?? '',
    accountNo: initial?.accountNo ?? '',
    accountHolder: initial?.accountHolder ?? '',
    officialFeeRate: initial?.officialFeeRate ?? '',
    unofficialFeeRate: initial?.unofficialFeeRate ?? '',
    paymentTerm: initial?.paymentTerm ?? '',
    memo: initial?.memo ?? '',
    roleTags: initial?.roleTags ?? [],
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  function submit() {
    startTransition(async () => {
      const res = initial?.id
        ? await updateCounterparty(initial.id, form)
        : await createCounterparty(form)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('저장되었습니다')
      router.push('/counterparties')
      router.refresh()
    })
  }

  function handleDelete() {
    if (!initial?.id) return
    if (!confirm('정말 삭제하시겠습니까? (비활성화됩니다)')) return
    startTransition(async () => {
      const res = await deleteCounterparty(initial.id!)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('비활성화되었습니다')
      router.push('/counterparties')
      router.refresh()
    })
  }

  return (
    <div className="px-8 py-6">
      {readOnly && (
        <p className="mb-3 text-[12.5px] text-muted-foreground">조회 전용 — 수정 권한이 없습니다</p>
      )}
      <fieldset disabled={readOnly} className="contents">
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="grid gap-1.5 md:col-span-2">
            <Label>상호명 *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>사업자번호</Label>
            <Input
              value={form.businessNo ?? ''}
              onChange={(e) => set('businessNo', e.target.value)}
              placeholder="000-00-00000"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>대표자</Label>
            <Input value={form.ceo ?? ''} onChange={(e) => set('ceo', e.target.value)} />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>주소</Label>
            <Input
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>업태</Label>
            <Input
              value={form.businessType ?? ''}
              onChange={(e) => set('businessType', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>종목</Label>
            <Input
              value={form.businessCategory ?? ''}
              onChange={(e) => set('businessCategory', e.target.value)}
              placeholder="매체사/광고대행업/..."
            />
          </div>
          <div className="grid gap-1.5">
            <Label>전화번호</Label>
            <Input
              value={form.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>이메일</Label>
            <Input
              type="email"
              value={form.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>담당자(거래처측)</Label>
            <Input
              value={form.contactPerson ?? ''}
              onChange={(e) => set('contactPerson', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>거래은행</Label>
            <Input
              value={form.bankName ?? ''}
              onChange={(e) => set('bankName', e.target.value)}
              placeholder="신한"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>예금주</Label>
            <Input
              value={form.accountHolder ?? ''}
              onChange={(e) => set('accountHolder', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>계좌번호</Label>
            <Input
              value={form.accountNo ?? ''}
              onChange={(e) => set('accountNo', e.target.value)}
              placeholder="100-000-424857"
            />
            {form.bankAccountRaw && (
              <p className="text-[11.5px] text-muted-foreground">
                엑셀 원문: {form.bankAccountRaw}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>공식수수료</Label>
            <Input
              value={form.officialFeeRate ?? ''}
              onChange={(e) => set('officialFeeRate', e.target.value)}
              placeholder="입금가 / 0.1 / 자유"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>비공식수수료 (페이백)</Label>
            <Input
              value={form.unofficialFeeRate ?? ''}
              onChange={(e) => set('unofficialFeeRate', e.target.value)}
              placeholder="5% (페이백)"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>결제일</Label>
            <Input
              value={form.paymentTerm ?? ''}
              onChange={(e) => set('paymentTerm', e.target.value)}
              placeholder="익월말 / 당월말 / ..."
            />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>메모</Label>
            <Textarea
              rows={3}
              value={form.memo ?? ''}
              onChange={(e) => set('memo', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      </fieldset>

      <div className="mt-6 flex items-center justify-between">
        <div>
          {initial?.id && canDelete && !readOnly && (
            <Button variant="destructive" onClick={handleDelete} disabled={pending}>
              비활성화
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.push('/counterparties')}>
            {readOnly ? '목록으로' : '취소'}
          </Button>
          {!readOnly && (
            <Button disabled={pending || !form.name.trim()} onClick={submit}>
              {pending ? '저장 중...' : '저장'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
