'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createDeal, updateDeal, type DealInput } from '@/server/actions/deals'
import { CounterpartyCombobox } from './counterparty-combobox'
import { CounterpartyQuickCreate } from '../counterparties/counterparty-quick-create'
import { formatKRW } from '@/lib/format'

type Lookups = {
  categories: { id: number; nameKo: string; commissionRate: string | null }[]
  accounts: { id: number; nameKo: string }[]
  salesMethods: { id: number; nameKo: string }[]
  users: { id: string; name: string; dealCodePrefix: string | null }[]
}

type Initial = Partial<DealInput> & {
  id?: string
  issuerLabel?: string | null
  advertiserLabel?: string | null
  supplierLabel?: string | null
}

export function DealForm({
  lookups,
  initial,
}: {
  lookups: Lookups
  initial?: Initial
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [createState, setCreateState] = useState<{
    field: 'issuer' | 'advertiser' | 'supplier'
    name: string
  } | null>(null)

  const now = new Date()
  const [form, setForm] = useState<DealInput>({
    dealCode: initial?.dealCode ?? '',
    accrualYear: initial?.accrualYear ?? now.getFullYear(),
    accrualMonth: initial?.accrualMonth ?? now.getMonth() + 1,
    ownerUserId: initial?.ownerUserId ?? null,
    categoryId: initial?.categoryId ?? null,
    accountId: initial?.accountId ?? null,
    currency: (initial?.currency as 'KRW' | 'USD' | 'CNY') ?? 'KRW',
    status: (initial?.status as 'draft' | 'confirmed' | 'closed') ?? 'draft',
    salesMethodId: initial?.salesMethodId ?? null,
    issuerCounterpartyId: initial?.issuerCounterpartyId ?? null,
    advertiserCounterpartyId: initial?.advertiserCounterpartyId ?? null,
    itemName: initial?.itemName ?? '',
    adStart: initial?.adStart ?? null,
    adEnd: initial?.adEnd ?? null,
    salesAmountNet: initial?.salesAmountNet ?? null,
    salesVat: initial?.salesVat ?? null,
    salesAmountGross: initial?.salesAmountGross ?? null,
    salesDueDate: initial?.salesDueDate ?? null,
    salesPaidDate: initial?.salesPaidDate ?? null,
    salesPaidStatus: (initial?.salesPaidStatus as 'pending' | 'completed') ?? 'pending',
    salesInvoiceDate: initial?.salesInvoiceDate ?? null,
    salesMemo: initial?.salesMemo ?? '',
    supplierCounterpartyId: initial?.supplierCounterpartyId ?? null,
    settlementYear: initial?.settlementYear ?? null,
    settlementMonth: initial?.settlementMonth ?? null,
    purchasePricingRaw: initial?.purchasePricingRaw ?? '',
    purchaseAmountNet: initial?.purchaseAmountNet ?? null,
    purchaseVat: initial?.purchaseVat ?? null,
    purchaseAmountGross: initial?.purchaseAmountGross ?? null,
    purchaseDueDate: initial?.purchaseDueDate ?? null,
    purchasePaidDate: initial?.purchasePaidDate ?? null,
    purchasePaidStatus: (initial?.purchasePaidStatus as 'pending' | 'completed') ?? 'pending',
    purchaseInvoiceDate: initial?.purchaseInvoiceDate ?? null,
    purchaseMemo: initial?.purchaseMemo ?? '',
    commissionPct: initial?.commissionPct ?? null,
    commissionAmount: initial?.commissionAmount ?? null,
  })

  const [labels, setLabels] = useState({
    issuer: initial?.issuerLabel ?? '',
    advertiser: initial?.advertiserLabel ?? '',
    supplier: initial?.supplierLabel ?? '',
  })

  function set<K extends keyof DealInput>(key: K, value: DealInput[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  // 자동 계산: VAT, 총액, 손익, 성과급
  const salesNet = parseFloat(String(form.salesAmountNet ?? 0)) || 0
  const purchaseNet = parseFloat(String(form.purchaseAmountNet ?? 0)) || 0
  const salesVat = form.salesVat ? parseFloat(String(form.salesVat)) : Math.round(salesNet * 0.1)
  const purchaseVat = form.purchaseVat ? parseFloat(String(form.purchaseVat)) : Math.round(purchaseNet * 0.1)
  const profit = salesNet - purchaseNet
  const cat = lookups.categories.find((c) => c.id === form.categoryId)
  const commissionRate = cat?.commissionRate ? parseFloat(cat.commissionRate) : 0
  const computedCommission = Math.round(profit * commissionRate)

  // 매출/매입금 변경시 VAT, Gross 자동 채우기
  useEffect(() => {
    if (form.salesAmountNet && !form.salesVat) {
      const vat = Math.round(salesNet * 0.1)
      setForm((p) => ({
        ...p,
        salesVat: vat.toString(),
        salesAmountGross: (salesNet + vat).toString(),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.salesAmountNet])

  useEffect(() => {
    if (form.purchaseAmountNet && !form.purchaseVat) {
      const vat = Math.round(purchaseNet * 0.1)
      setForm((p) => ({
        ...p,
        purchaseVat: vat.toString(),
        purchaseAmountGross: (purchaseNet + vat).toString(),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.purchaseAmountNet])

  function handleSubmit(status: 'draft' | 'confirmed') {
    const payload = { ...form, status }
    startTransition(async () => {
      const res = initial?.id
        ? await updateDeal(initial.id, payload)
        : await createDeal(payload)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(initial?.id ? '저장되었습니다' : '거래가 등록되었습니다')
      router.push('/deals')
      router.refresh()
    })
  }

  return (
    <div className="p-6">
      {/* 공통 마스터 */}
      <Card className="mb-4">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>거래코드</Label>
            <Input
              value={form.dealCode ?? ''}
              onChange={(e) => set('dealCode', e.target.value)}
              placeholder={initial?.id ? '' : '비우면 자동 채번'}
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>귀속연도 *</Label>
              <Input
                type="number"
                value={form.accrualYear}
                onChange={(e) => set('accrualYear', Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>귀속월 *</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={form.accrualMonth}
                onChange={(e) => set('accrualMonth', Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>담당자</Label>
            <Select
              value={form.ownerUserId ?? ''}
              onValueChange={(v) => set('ownerUserId', v || null)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lookups.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} {u.dealCodePrefix && `(${u.dealCodePrefix})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>상품구분 *</Label>
            <Select
              value={form.categoryId ? String(form.categoryId) : ''}
              onValueChange={(v) => set('categoryId', v ? Number(v) : null)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lookups.categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nameKo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>계정항목</Label>
            <Select
              value={form.accountId ? String(form.accountId) : ''}
              onValueChange={(v) => set('accountId', v ? Number(v) : null)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lookups.accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.nameKo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>통화</Label>
            <Select
              value={form.currency}
              onValueChange={(v) => set('currency', (v as 'KRW') || 'KRW')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KRW">KRW</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="CNY">CNY</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 매출 (좌) */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 text-base font-semibold">💰 매출</h3>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>발행처</Label>
                <CounterpartyCombobox
                  value={form.issuerCounterpartyId ?? null}
                  initialLabel={labels.issuer}
                  onChange={(id, label) => {
                    set('issuerCounterpartyId', id)
                    setLabels((p) => ({ ...p, issuer: label ?? '' }))
                  }}
                  onCreateRequest={(name) => setCreateState({ field: 'issuer', name })}
                  placeholder="발행처 검색..."
                />
              </div>
              <div className="grid gap-1.5">
                <Label>실광고주</Label>
                <CounterpartyCombobox
                  value={form.advertiserCounterpartyId ?? null}
                  initialLabel={labels.advertiser}
                  onChange={(id, label) => {
                    set('advertiserCounterpartyId', id)
                    setLabels((p) => ({ ...p, advertiser: label ?? '' }))
                  }}
                  onCreateRequest={(name) => setCreateState({ field: 'advertiser', name })}
                  placeholder="실광고주 (대행시만)"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>품목명</Label>
                <Input
                  value={form.itemName ?? ''}
                  onChange={(e) => set('itemName', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>광고 시작</Label>
                  <Input
                    type="date"
                    value={form.adStart ?? ''}
                    onChange={(e) => set('adStart', e.target.value || null)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>광고 종료</Label>
                  <Input
                    type="date"
                    value={form.adEnd ?? ''}
                    onChange={(e) => set('adEnd', e.target.value || null)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>매출수단</Label>
                <Select
                  value={form.salesMethodId ? String(form.salesMethodId) : ''}
                  onValueChange={(v) => set('salesMethodId', v ? Number(v) : null)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.salesMethods.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.nameKo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <MoneyRow
                netLabel="매출금"
                vatLabel="부가세"
                grossLabel="총매출"
                net={form.salesAmountNet}
                vat={form.salesVat}
                gross={form.salesAmountGross}
                onNet={(v) => set('salesAmountNet', v)}
                onVat={(v) => set('salesVat', v)}
                onGross={(v) => set('salesAmountGross', v)}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>입금예정일</Label>
                  <Input
                    type="date"
                    value={form.salesDueDate ?? ''}
                    onChange={(e) => set('salesDueDate', e.target.value || null)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>입금일</Label>
                  <Input
                    type="date"
                    value={form.salesPaidDate ?? ''}
                    onChange={(e) => set('salesPaidDate', e.target.value || null)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>매출 세계발행일</Label>
                  <Input
                    type="date"
                    value={form.salesInvoiceDate ?? ''}
                    onChange={(e) => set('salesInvoiceDate', e.target.value || null)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>입금여부</Label>
                  <Select
                    value={form.salesPaidStatus}
                    onValueChange={(v) => set('salesPaidStatus', (v as 'pending') || 'pending')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">미입금</SelectItem>
                      <SelectItem value="partial">일부</SelectItem>
                      <SelectItem value="completed">완료</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>매출 비고</Label>
                <Textarea
                  rows={2}
                  value={form.salesMemo ?? ''}
                  onChange={(e) => set('salesMemo', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 매입 (우) */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 text-base font-semibold">📦 매입</h3>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>매체사</Label>
                <CounterpartyCombobox
                  value={form.supplierCounterpartyId ?? null}
                  initialLabel={labels.supplier}
                  onChange={(id, label) => {
                    set('supplierCounterpartyId', id)
                    setLabels((p) => ({ ...p, supplier: label ?? '' }))
                  }}
                  onCreateRequest={(name) => setCreateState({ field: 'supplier', name })}
                  placeholder="매체사 검색..."
                />
              </div>
              <div className="grid gap-1.5">
                <Label>수수료</Label>
                <Input
                  value={form.purchasePricingRaw ?? ''}
                  onChange={(e) => set('purchasePricingRaw', e.target.value)}
                  placeholder="입금가 / 0.1 / 자유 텍스트"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>결산연도</Label>
                  <Input
                    type="number"
                    value={form.settlementYear ?? ''}
                    onChange={(e) =>
                      set('settlementYear', e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>결산월</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={form.settlementMonth ?? ''}
                    onChange={(e) =>
                      set('settlementMonth', e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
              </div>
              <MoneyRow
                netLabel="매입금"
                vatLabel="부가세"
                grossLabel="총매입"
                net={form.purchaseAmountNet}
                vat={form.purchaseVat}
                gross={form.purchaseAmountGross}
                onNet={(v) => set('purchaseAmountNet', v)}
                onVat={(v) => set('purchaseVat', v)}
                onGross={(v) => set('purchaseAmountGross', v)}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>결산예정일</Label>
                  <Input
                    type="date"
                    value={form.purchaseDueDate ?? ''}
                    onChange={(e) => set('purchaseDueDate', e.target.value || null)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>지급일</Label>
                  <Input
                    type="date"
                    value={form.purchasePaidDate ?? ''}
                    onChange={(e) => set('purchasePaidDate', e.target.value || null)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>매입 세계발행일</Label>
                  <Input
                    type="date"
                    value={form.purchaseInvoiceDate ?? ''}
                    onChange={(e) => set('purchaseInvoiceDate', e.target.value || null)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>결산여부</Label>
                  <Select
                    value={form.purchasePaidStatus}
                    onValueChange={(v) =>
                      set('purchasePaidStatus', (v as 'pending') || 'pending')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">미결산</SelectItem>
                      <SelectItem value="partial">일부</SelectItem>
                      <SelectItem value="completed">완료</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>매입 비고</Label>
                <Textarea
                  rows={2}
                  value={form.purchaseMemo ?? ''}
                  onChange={(e) => set('purchaseMemo', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 자동 계산 */}
      <Card className="mt-4">
        <CardContent className="flex items-center justify-around gap-6 py-4 text-sm">
          <div>
            <span className="text-zinc-500">손익</span>{' '}
            <b
              className={profit < 0 ? 'text-red-600' : profit > 0 ? 'text-emerald-700' : ''}
            >
              {formatKRW(profit)}
            </b>
            {salesNet > 0 && (
              <span className="ml-1 text-xs text-zinc-500">
                ({((profit / salesNet) * 100).toFixed(1)}%)
              </span>
            )}
          </div>
          <div>
            <span className="text-zinc-500">성과급</span>{' '}
            <b>{formatKRW(computedCommission)}</b>
            {cat && (
              <span className="ml-1 text-xs text-zinc-500">
                ({(commissionRate * 100).toFixed(0)}% — {cat.nameKo})
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/deals')}>
          ↩ 취소
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => handleSubmit('draft')}
          >
            임시저장
          </Button>
          <Button disabled={pending} onClick={() => handleSubmit('confirmed')}>
            {pending ? '저장 중...' : '확정저장'}
          </Button>
        </div>
      </div>

      {createState && (
        <CounterpartyQuickCreate
          name={createState.name}
          onClose={() => setCreateState(null)}
          onCreated={(id, name) => {
            const field = createState.field
            if (field === 'issuer') {
              set('issuerCounterpartyId', id)
              setLabels((p) => ({ ...p, issuer: name }))
            } else if (field === 'advertiser') {
              set('advertiserCounterpartyId', id)
              setLabels((p) => ({ ...p, advertiser: name }))
            } else {
              set('supplierCounterpartyId', id)
              setLabels((p) => ({ ...p, supplier: name }))
            }
            setCreateState(null)
            toast.success(`거래처 등록: ${name}`)
          }}
        />
      )}
    </div>
  )
}

function MoneyRow({
  netLabel,
  vatLabel,
  grossLabel,
  net,
  vat,
  gross,
  onNet,
  onVat,
  onGross,
}: {
  netLabel: string
  vatLabel: string
  grossLabel: string
  net: string | null | undefined
  vat: string | null | undefined
  gross: string | null | undefined
  onNet: (v: string | null) => void
  onVat: (v: string | null) => void
  onGross: (v: string | null) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="grid gap-1.5">
        <Label>{netLabel} *</Label>
        <Input
          type="text"
          inputMode="numeric"
          value={net ?? ''}
          onChange={(e) => onNet(e.target.value || null)}
          className="text-right font-mono"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>{vatLabel}</Label>
        <Input
          type="text"
          inputMode="numeric"
          value={vat ?? ''}
          onChange={(e) => onVat(e.target.value || null)}
          className="text-right font-mono"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>{grossLabel}</Label>
        <Input
          type="text"
          inputMode="numeric"
          value={gross ?? ''}
          onChange={(e) => onGross(e.target.value || null)}
          className="text-right font-mono"
        />
      </div>
    </div>
  )
}
