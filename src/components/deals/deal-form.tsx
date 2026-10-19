'use client'

import { listHref } from '@/lib/list-return'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Coins, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { checkDealCode, createDeal, deleteDeal, lookupFxRate, updateDeal, type DealInput } from '@/server/actions/deals'
import { profitKrw } from '@/lib/incentive'
import { CounterpartyCombobox } from './counterparty-combobox'
import { CounterpartyQuickCreate } from '../counterparties/counterparty-quick-create'
import { formatKRW } from '@/lib/format'
import { formatAmountInput } from '@/lib/loose-date'
import { AmountInput, truncAmount } from '@/components/ui/amount-input'
import { cn } from '@/lib/utils'

/**
 * 입력 항목 제목 (2026-09-16 피드백): 비고 외 모든 제목에 필수표시(*), 회계팀이 채우는 항목은 빨간 '(회계팀 입력)'.
 * 별표는 CSS 로 붙여 제목 텍스트 자체는 그대로 둔다.
 */
function FL({ children, optional, accounting }: { children: React.ReactNode; optional?: boolean; accounting?: boolean }) {
  return (
    <Label
      data-required={optional ? undefined : ''}
      className={cn('gap-1', !optional && "after:text-destructive after:content-['*']")}
    >
      {children}
      {accounting && <span className="text-[11px] font-medium text-destructive">(회계팀 입력)</span>}
    </Label>
  )
}

/** 운영에서 쓰는 '거래처 없음' 표시용 거래처 — 이름이 "(매출처 없음)"·"(매입처 없음)" */
const isNoneParty = (label: string | null | undefined) => /^\(?\s*(매출처|매입처)\s*없음\s*\)?$/.test(label?.trim() ?? '')

type Lookups = {
  categories: { id: number; nameKo: string; commissionRate: string | null }[]
  accounts: { id: number; nameKo: string }[]
  salesMethods: { id: number; nameKo: string }[]
  users: { id: string; name: string; dealCodePrefix: string | null }[]
}

type Initial = Partial<DealInput> & {
  id?: string
  issuerLabel?: string | null
  supplierLabel?: string | null
}

export function DealForm({
  lookups,
  initial,
  readOnly = false,
  backHref = '/deals',
  canDelete = false,
  foreign = false,
  defaultCurrency = 'KRW',
}: {
  lookups: Lookups
  initial?: Initial
  readOnly?: boolean
  /** 미국·중국법인 (2026-10-12 요청): 부가세·계산서 발행일 없음, 매출수단에서 세금계산서·현금영수증 제외 */
  foreign?: boolean
  /** 새 거래의 통화 기본값 — 미국 USD, 중국 CNY */
  defaultCurrency?: 'KRW' | 'USD' | 'CNY'
  /** 취소·저장 후 돌아갈 목록 URL (필터 보존) */
  backHref?: string
  canDelete?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [createState, setCreateState] = useState<{
    field: 'issuer' | 'supplier'
    name: string
  } | null>(null)

  const [codeDup, setCodeDup] = useState(false)
  const now = new Date()
  const [form, setForm] = useState<DealInput>({
    dealCode: initial?.dealCode ?? '',
    accrualYear: initial?.accrualYear ?? now.getFullYear(),
    accrualMonth: initial?.accrualMonth ?? now.getMonth() + 1,
    ownerUserId: initial?.ownerUserId ?? null,
    categoryId: initial?.categoryId ?? null,
    accountId: initial?.accountId ?? null,
    currency: (initial?.currency as 'KRW' | 'USD' | 'CNY') ?? defaultCurrency,
    fxRate: initial?.fxRate ?? null,
    status: (initial?.status as 'draft' | 'confirmed' | 'closed') ?? 'draft',
    salesMethodId: initial?.salesMethodId ?? null,
    issuerCounterpartyId: initial?.issuerCounterpartyId ?? null,
    advertiserCounterpartyId: initial?.advertiserCounterpartyId ?? null,
    advertiserName: initial?.advertiserName ?? null,
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
    settlementDay: initial?.settlementDay ?? null,
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
    profitAdjusted: initial?.profitAdjusted ?? null,
    profitAdjustMemo: initial?.profitAdjustMemo ?? null,
  })

  const [labels, setLabels] = useState({
    issuer: initial?.issuerLabel ?? '',
    supplier: initial?.supplierLabel ?? '',
  })

  function set<K extends keyof DealInput>(key: K, value: DealInput[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  // 자동 계산: VAT, 총액, 손익, 성과급
  const salesNet = parseFloat(String(form.salesAmountNet ?? 0)) || 0
  const purchaseNet = parseFloat(String(form.purchaseAmountNet ?? 0)) || 0
  const autoProfit = salesNet - purchaseNet
  // 손익 수동 조정 (2026-10-15 요청): 넣으면 자동 계산 대신 이 값으로 성과급·리포트 계산
  const adjusted = form.profitAdjusted != null && String(form.profitAdjusted).trim() !== ''
  const profit = adjusted ? parseFloat(String(form.profitAdjusted).replace(/,/g, '')) || 0 : autoProfit

  // 금액 입력 → 부가세 10% 자동, 총액 = 금액 + 부가세 자동 (2026-09-09 피드백). 부가세를 고치면 총액만 재계산
  const num = (v: string | null | undefined) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0
  // 부가세 없는 거래 (2026-09-29 요청: 해외영업 건) — "삭제"를 누르면 금액을 고쳐도 부가세를 다시 채우지 않는다
  const hasAmount = (v: string | null | undefined) => v != null && v !== '' && num(v) !== 0
  const [noVat, setNoVat] = useState({
    sales: foreign || (hasAmount(initial?.salesAmountNet) && !hasAmount(initial?.salesVat)),
    purchase: foreign || (hasAmount(initial?.purchaseAmountNet) && !hasAmount(initial?.purchaseVat)),
  })
  // 외화 거래: 환율은 매출 입금일 기준으로 자동 (2026-10-12 요청), 손으로 고칠 수도 있다
  const isFx = form.currency !== 'KRW'
  const krw = isFx ? profitKrw(profit, form.currency, form.fxRate) : null
  const [fxLoading, setFxLoading] = useState(false)
  async function refreshFx(currency: string, date: string | null | undefined) {
    if (currency === 'KRW' || !date) return
    setFxLoading(true)
    const res = await lookupFxRate(currency, date).catch(() => ({ rate: null }))
    setFxLoading(false)
    if (res.rate != null) set('fxRate', res.rate.toFixed(4))
    else toast.error('환율을 불러오지 못했습니다', { description: '환율 칸에 직접 입력해 주세요' })
  }
  const salesMethods = foreign ? lookups.salesMethods.filter((m) => m.nameKo !== '세금계산서' && m.nameKo !== '현금영수증') : lookups.salesMethods
  function setMoney(side: 'sales' | 'purchase', field: 'net' | 'vat', v: string | null) {
    const netKey = side === 'sales' ? 'salesAmountNet' : 'purchaseAmountNet'
    const vatKey = side === 'sales' ? 'salesVat' : 'purchaseVat'
    const grossKey = side === 'sales' ? 'salesAmountGross' : 'purchaseAmountGross'
    // 부가세를 직접 적으면 "부가세 없음" 상태는 풀린다
    if (field === 'vat' && hasAmount(v)) setNoVat((p) => ({ ...p, [side]: false }))
    setForm((p) => {
      const net = field === 'net' ? v : p[netKey]
      const vat = field === 'net' ? (noVat[side] ? null : v ? Math.round(num(v) * 0.1).toString() : null) : v
      const gross = net ? (num(net) + num(vat)).toString() : null
      return { ...p, [netKey]: net, [vatKey]: vat, [grossKey]: gross }
    })
  }
  function toggleVat(side: 'sales' | 'purchase') {
    const netKey = side === 'sales' ? 'salesAmountNet' : 'purchaseAmountNet'
    const vatKey = side === 'sales' ? 'salesVat' : 'purchaseVat'
    const grossKey = side === 'sales' ? 'salesAmountGross' : 'purchaseAmountGross'
    const remove = !noVat[side]
    setNoVat((p) => ({ ...p, [side]: remove }))
    setForm((p) => {
      const net = p[netKey]
      const vat = remove || !net ? null : Math.round(num(net) * 0.1).toString()
      return { ...p, [vatKey]: vat, [grossKey]: net ? (num(net) + num(vat)).toString() : null }
    })
  }

  /**
   * 비어 있는 필수 항목 이름. 매출·매입은 한쪽만 있는 거래(매입건·매출만)도 있어서
   * 그 쪽에 무언가(거래처·금액) 입력했을 때만 그 쪽 항목을 요구한다.
   */
  function missingRequired(): string[] {
    const empty = (v: unknown) => v == null || String(v).trim() === ''
    const out: string[] = []
    const base: [string, unknown][] = [['거래코드', form.dealCode], ['귀속연도', form.accrualYear], ['귀속월', form.accrualMonth], ['담당자', form.ownerUserId], ['상품구분', form.categoryId], ['계정항목', form.accountId], ['통화', form.currency]]
    for (const [label, v] of base) if (empty(v)) out.push(label)
    const salesUsed = !empty(form.issuerCounterpartyId) || !empty(form.salesAmountNet)
    const purchaseUsed = !empty(form.supplierCounterpartyId) || !empty(form.purchaseAmountNet)
    if (!salesUsed && !purchaseUsed) out.push('매출 또는 매입 중 하나')
    // '(매출처 없음)'·'(매입처 없음)' 거래처를 고르면 그 쪽 나머지 항목은 요구하지 않는다 (2026-10-15 요청)
    if (salesUsed && !isNoneParty(labels.issuer)) {
      const s: [string, unknown][] = [['발행처', form.issuerCounterpartyId], ['실광고주', form.advertiserName], ['품목명', form.itemName], ['광고 시작', form.adStart], ['광고 종료', form.adEnd], ['매출수단', form.salesMethodId], ['매출금', form.salesAmountNet], ['입금예정일', form.salesDueDate]]
      for (const [label, v] of s) if (empty(v)) out.push(label)
    }
    if (purchaseUsed && !isNoneParty(labels.supplier)) {
      const p: [string, unknown][] = [['매체사', form.supplierCounterpartyId], ['수수료', form.purchasePricingRaw], ['결산연도', form.settlementYear], ['결산월', form.settlementMonth], ['매입금', form.purchaseAmountNet]]
      for (const [label, v] of p) if (empty(v)) out.push(label)
    }
    return out
  }

  function handleSubmit(status: 'draft' | 'confirmed') {
    if (codeDup) {
      toast.error('거래코드가 중복됩니다. 다른 코드를 입력하세요.')
      return
    }
    // 거래코드 자동 채번 폐지 (2026-09-17 피드백) — 등록 시 직접 입력
    if (!initial?.id && !form.dealCode?.trim()) {
      toast.error('거래코드를 입력하세요')
      return
    }
    // 필수(*) 항목이 비면 저장하지 않는다 (2026-10-06 요청). 회계팀 입력 항목과 나중에 생기는 날짜(입금일·발행일·지급일)는 제외
    // 새 거래의 확정저장만 막는다. 임시저장(초안)과 기존 거래 수정은 비어 있어도 저장 — 엑셀에서 온 거래는 빈 칸이 많아 수정까지 막으면 아무것도 고칠 수 없다
    const missing = !initial?.id && status === 'confirmed' ? missingRequired() : []
    if (missing.length) {
      toast.error(`필수 항목이 비어 있습니다: ${missing.join(', ')}`, { description: '별표(*) 항목을 모두 채운 뒤 저장해 주세요', duration: 8000 })
      return
    }
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
      router.push(backHref === '/deals' ? listHref('/deals') : backHref)
    })
  }

  return (
    <div className="px-8 py-6">
      {readOnly && (
        <div className="mb-4 rounded-md border border-accent-foreground/30 bg-accent px-4 py-2.5 text-sm text-accent-foreground">
          🔒 다른 담당자의 거래는 읽기 전용입니다. 수정은 담당자 또는 회계에 요청하세요.
        </div>
      )}
      <fieldset disabled={readOnly} className="contents">
      {/* 공통 마스터 */}
      <Card className="mb-4">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
          <div className="grid gap-1.5">
            <FL>거래코드</FL>
            <Input
              value={form.dealCode ?? ''}
              onChange={(e) => {
                set('dealCode', e.target.value)
                setCodeDup(false)
              }}
              onBlur={async (e) => {
                const code = e.target.value.trim()
                if (!code || code === initial?.dealCode) return
                const res = await checkDealCode(code, initial?.id)
                setCodeDup(res.duplicate)
                if (res.duplicate) toast.error(`거래코드 중복: ${code} 은(는) 이미 등록된 코드입니다`)
              }}
              aria-invalid={codeDup || undefined}
              placeholder={initial?.id ? '' : '예) AM260917-1'}
              className={cn('font-mono', codeDup && 'border-destructive')}
            />
            {codeDup && <p className="text-xs text-destructive">이미 등록된 거래코드입니다. 다른 코드를 입력하세요.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <FL>귀속연도</FL>
              <Input
                type="number"
                value={form.accrualYear}
                onChange={(e) => set('accrualYear', Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <FL>귀속월</FL>
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
            <FL>담당자</FL>
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
            <FL>상품구분</FL>
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
            <FL>계정항목</FL>
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
            <FL>통화</FL>
            <Select
              value={form.currency}
              onValueChange={(v) => {
                const c = (v as 'KRW') || 'KRW'
                set('currency', c)
                if (c !== form.currency) refreshFx(c, form.salesPaidDate)
              }}
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
            <h3 className="mb-4 flex items-center gap-2 text-base font-medium">
              <span className="grid size-[26px] place-items-center rounded-md border border-current/40 bg-accent text-primary">
                <Coins className="size-[15px]" />
              </span>
              매출
            </h3>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <FL>발행처</FL>
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
                <FL>실광고주</FL>
                <Input
                  value={form.advertiserName ?? ''}
                  onChange={(e) => set('advertiserName', e.target.value || null)}
                  placeholder="실광고주 (대행시만) — 직접 입력"
                />
              </div>
              <div className="grid gap-1.5">
                <FL>품목명</FL>
                <Input
                  value={form.itemName ?? ''}
                  onChange={(e) => set('itemName', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <FL>광고 시작</FL>
                  <DateInput aria-label="adStart" value={form.adStart} onChange={(v) => set('adStart', v)} />
                </div>
                <div className="grid gap-1.5">
                  <FL>광고 종료</FL>
                  <DateInput aria-label="adEnd" value={form.adEnd} onChange={(v) => set('adEnd', v)} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <FL>매출수단</FL>
                <Select
                  value={form.salesMethodId ? String(form.salesMethodId) : ''}
                  onValueChange={(v) => set('salesMethodId', v ? Number(v) : null)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {salesMethods.map((m) => (
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
                onNet={(v) => setMoney('sales', 'net', v)}
                onVat={(v) => setMoney('sales', 'vat', v)}
                noVat={noVat.sales}
                onToggleVat={() => toggleVat('sales')}
                integer={form.currency === 'KRW'}
                hideVat={foreign}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <FL>입금예정일</FL>
                  <DateInput aria-label="salesDueDate" value={form.salesDueDate} onChange={(v) => set('salesDueDate', v)} />
                </div>
                <div className="grid gap-1.5">
                  <FL>입금일</FL>
                  <DateInput
                    aria-label="salesPaidDate"
                    value={form.salesPaidDate}
                    onChange={(v) => {
                      set('salesPaidDate', v)
                      if (v && v !== form.salesPaidDate) refreshFx(form.currency, v)
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {!foreign && (
                  <div className="grid gap-1.5">
                    <FL>매출 세계발행일</FL>
                    <DateInput aria-label="salesInvoiceDate" value={form.salesInvoiceDate} onChange={(v) => set('salesInvoiceDate', v)} />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <FL>입금여부</FL>
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
                <FL optional>매출 비고</FL>
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
            <h3 className="mb-4 flex items-center gap-2 text-base font-medium">
              <span className="grid size-[26px] place-items-center rounded-md border border-current/40 bg-muted text-muted-foreground">
                <Package className="size-[15px]" />
              </span>
              매입
            </h3>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <FL>매체사</FL>
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
                <FL>수수료</FL>
                <Input
                  value={form.purchasePricingRaw ?? ''}
                  onChange={(e) => set('purchasePricingRaw', e.target.value)}
                  placeholder="입금가 / 0.1 / 자유 텍스트"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1.5">
                  <FL>결산연도</FL>
                  <Input
                    type="number"
                    value={form.settlementYear ?? ''}
                    onChange={(e) => set('settlementYear', e.target.value ? Number(e.target.value) : null)}
                    // '26' 처럼 두 자리로 치면 2026 으로
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (e.target.value && n >= 0 && n < 100) set('settlementYear', 2000 + n)
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <FL>결산월</FL>
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
                {/* 결산일 (2026-10-14 요청: 결산연월 → 결산연월일) */}
                <div className="grid gap-1.5">
                  <FL>결산일</FL>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    aria-label="결산일"
                    value={form.settlementDay ?? ''}
                    onChange={(e) => set('settlementDay', e.target.value ? Number(e.target.value) : null)}
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
                onNet={(v) => setMoney('purchase', 'net', v)}
                onVat={(v) => setMoney('purchase', 'vat', v)}
                noVat={noVat.purchase}
                onToggleVat={() => toggleVat('purchase')}
                integer={form.currency === 'KRW'}
                hideVat={foreign}
              />
              <div className="grid grid-cols-2 gap-2">
                {/* 결산예정일은 결산연월로 대체 (2026-10-06 요청) — 월별 수금결산의 매입 예정은 결산연월 기준 */}
                <div className="grid gap-1.5">
                  <FL accounting>지급일</FL>
                  <DateInput aria-label="purchasePaidDate" value={form.purchasePaidDate} onChange={(v) => set('purchasePaidDate', v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {!foreign && (
                  <div className="grid gap-1.5">
                    <FL accounting>매입 세계발행일</FL>
                    <DateInput aria-label="purchaseInvoiceDate" value={form.purchaseInvoiceDate} onChange={(v) => set('purchaseInvoiceDate', v)} />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <FL accounting>결산여부</FL>
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
                <FL optional>매입 비고</FL>
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
            <span className="text-muted-foreground">손익</span>{' '}
            <b
              className={profit < 0 ? 'text-destructive' : profit > 0 ? 'text-success-foreground' : ''}
            >
              {formatKRW(profit)}
            </b>
            {salesNet > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({((profit / salesNet) * 100).toFixed(1)}%)
              </span>
            )}
            {adjusted && <span className="ml-1 text-xs text-muted-foreground">(자동 계산 {formatKRW(autoProfit)})</span>}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="deal-profit-adjusted" className="text-muted-foreground" title="비워 두면 매출금 − 매입금으로 자동 계산합니다">
              조정 손익
            </label>
            <AmountInput
              id="deal-profit-adjusted"
              aria-label="조정 손익"
              value={form.profitAdjusted}
              onChange={(v) => set('profitAdjusted', v)}
              placeholder="비우면 자동"
              className="h-8 w-36 text-right font-mono"
            />
            <Input
              aria-label="손익 조정 사유"
              value={form.profitAdjustMemo ?? ''}
              onChange={(e) => set('profitAdjustMemo', e.target.value || null)}
              placeholder="조정 사유"
              disabled={!adjusted}
              className="h-8 w-48"
            />
          </div>
          {isFx && (
            <>
              <div className="flex items-center gap-2">
                <label htmlFor="deal-fx-rate" className="text-muted-foreground" title="매출 입금일 기준 은행 매매기준율(한국은행 고시) 자동 · 직접 고칠 수 있습니다">
                  환율
                </label>
                <AmountInput
                  id="deal-fx-rate"
                  aria-label="환율"
                  value={form.fxRate}
                  onChange={(v) => set('fxRate', v)}
                  placeholder={fxLoading ? '불러오는 중…' : '입금일 입력 시 자동'}
                  className="h-8 w-32 text-right font-mono"
                />
                <span className="text-xs text-muted-foreground">KRW / {form.currency}</span>
              </div>
              <div data-slot="profit-krw">
                <span className="text-muted-foreground">손익(KRW)</span>{' '}
                <b className={krw != null && krw < 0 ? 'text-destructive' : krw ? 'text-success-foreground' : ''}>{krw != null ? formatKRW(krw) : '-'}</b>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.push(backHref === '/deals' ? listHref('/deals') : backHref)}>
            ↩ 취소
          </Button>
          {initial?.id && canDelete && !readOnly && (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`거래 ${initial.dealCode ?? ''} 을(를) 삭제할까요? 목록·리포트에서 제외되며 복구는 개발팀에 요청해야 합니다.`)) return
                startTransition(async () => {
                  const res = await deleteDeal(initial.id!)
                  if (res && 'error' in res) {
                    toast.error(res.error)
                    return
                  }
                  toast.success('거래를 삭제했습니다')
                  router.push(backHref === '/deals' ? listHref('/deals') : backHref)
                })
              }}
            >
              삭제
            </Button>
          )}
        </div>
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
      </fieldset>

      {createState && (
        <CounterpartyQuickCreate
          name={createState.name}
          onClose={() => setCreateState(null)}
          onCreated={(id, name) => {
            const field = createState.field
            if (field === 'issuer') {
              set('issuerCounterpartyId', id)
              setLabels((p) => ({ ...p, issuer: name }))
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
  noVat,
  onToggleVat,
  integer,
  hideVat = false,
}: {
  netLabel: string
  vatLabel: string
  grossLabel: string
  net: string | null | undefined
  vat: string | null | undefined
  gross: string | null | undefined
  onNet: (v: string | null) => void
  onVat: (v: string | null) => void
  noVat: boolean
  onToggleVat: () => void
  integer: boolean
  hideVat?: boolean
}) {
  return (
    <div className={cn('grid gap-2', hideVat ? 'grid-cols-2' : 'grid-cols-3')}>
      <div className="grid gap-1.5">
        <FL>{netLabel}</FL>
        <AmountInput
          value={net}
          onChange={onNet}
          integer={integer}
          className="text-right font-mono"
        />
      </div>
      {!hideVat && (
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <FL>{vatLabel}</FL>
          <button
            type="button"
            data-slot="vat-toggle"
            aria-label={`${vatLabel} ${noVat ? '10% 계산' : '삭제'}`}
            title={noVat ? '금액의 10%로 다시 계산합니다' : '부가세 없는 거래 — 부가세를 비우고, 금액을 고쳐도 다시 채우지 않습니다'}
            onClick={onToggleVat}
            className={cn('text-[11.5px] font-medium underline underline-offset-2', noVat ? 'text-primary' : 'text-destructive')}
          >
            {noVat ? '10% 계산' : '삭제'}
          </button>
        </div>
        <AmountInput
          value={vat}
          onChange={onVat}
          integer={integer}
          placeholder={noVat ? '부가세 없음' : undefined}
          className="text-right font-mono"
        />
      </div>
      )}
      <div className="grid gap-1.5">
        <FL>{grossLabel}</FL>
        <Input
          type="text"
          inputMode="numeric"
          value={formatAmountInput(integer ? truncAmount(gross) : gross)}
          readOnly
          tabIndex={-1}
          title="금액 + 부가세 자동 계산"
          className="bg-muted/40 text-right font-mono text-muted-foreground"
        />
      </div>
    </div>
  )
}
