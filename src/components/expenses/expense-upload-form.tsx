'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { commitExpenseUpload, previewExpenseUpload, type PreviewRow, type UploadPreview } from '@/server/actions/expense-upload'
import { cn } from '@/lib/utils'
import { formatKRW } from '@/lib/format'

const PAYMENT_OPTIONS = [
  { value: 'corporate_card', label: '법인카드' },
  { value: 'personal_card', label: '개인카드' },
  { value: 'cash', label: '현금' },
  { value: 'bank_transfer', label: '이체' },
] as const

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm'

export function ExpenseUploadForm({ categories }: { categories: { id: number; nameKo: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_OPTIONS)[number]['value']>('corporate_card')
  const [skipDuplicates, setSkipDuplicates] = useState(true)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const fd = new FormData()
    fd.set('file', file)
    start(async () => {
      const res = await previewExpenseUpload(fd)
      if ('error' in res) {
        toast.error(res.error)
        setPreview(null)
        return
      }
      setPreview(res.preview)
      setRows(res.preview.rows)
    })
  }

  function setCategory(idx: number, id: number | null) {
    setRows((p) => p.map((r, i) => (i === idx ? { ...r, categoryId: id, categoryName: categories.find((c) => c.id === id)?.nameKo ?? null } : r)))
  }

  const toInsert = rows.filter((r) => !(skipDuplicates && r.duplicate))
  const unmatched = rows.filter((r) => r.categoryId == null).length

  function submit() {
    start(async () => {
      const res = await commitExpenseUpload({
        paymentMethod,
        skipDuplicates,
        rows: rows.map((r) => ({
          expenseDate: r.expenseDate,
          itemName: r.itemName,
          amount: r.amount,
          counterpartyText: r.counterpartyText,
          categoryId: r.categoryId,
          duplicate: r.duplicate,
        })),
      })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(`${res.inserted.toLocaleString()}건 등록${res.skipped ? ` · 중복 ${res.skipped}건 제외` : ''}`)
      router.push('/expenses')
      router.refresh()
    })
  }

  return (
    <div className="px-8 py-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="grid gap-1.5">
            <Label htmlFor="upload-file">엑셀 파일 (.xlsx)</Label>
            <label
              htmlFor="upload-file"
              className={cn(
                'flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-sm hover:bg-accent/40',
                pending && 'pointer-events-none opacity-50',
              )}
            >
              <FileSpreadsheet className="size-4 text-muted-foreground" />
              {fileName || '파일 선택'}
              <input id="upload-file" type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={onFile} disabled={pending} />
            </label>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="upload-method">결제수단 (전체 적용)</Label>
            <select id="upload-method" className={selectClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
              {PAYMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
            이미 등록된 것과 같은 행(날짜·금액·품목·거래처)은 건너뛰기
          </label>
        </CardContent>
      </Card>

      {preview && (
        <>
          <div data-testid="upload-summary" className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span>
              읽은 행 <b>{preview.summary.total.toLocaleString()}</b>건 · 합계 <b>₩{formatKRW(preview.summary.amount)}</b>
            </span>
            <span className={cn(unmatched && 'text-accent-foreground')}>항목 미매칭 <b>{unmatched}</b>건</span>
            <span className={cn(preview.summary.duplicates && 'text-accent-foreground')}>중복 <b>{preview.summary.duplicates}</b>건</span>
            {preview.issues.length > 0 && <span className="text-destructive">건너뛴 행 {preview.issues.length}건 (날짜·금액 오류)</span>}
            <span className="ml-auto text-muted-foreground">시트: {preview.sheet}</span>
          </div>

          {preview.issues.length > 0 && (
            <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {preview.issues.slice(0, 8).map((i) => `${i.rowNo}행: ${i.reason}`).join(' · ')}
              {preview.issues.length > 8 && ` 외 ${preview.issues.length - 8}건`}
            </div>
          )}

          <div className="mt-3 max-h-[60vh] overflow-auto rounded-2xl border bg-card">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">행</TableHead>
                  <TableHead>지출일</TableHead>
                  <TableHead>품목</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>거래항목(엑셀)</TableHead>
                  <TableHead>항목</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.rowNo} className={cn('text-xs', r.duplicate && skipDuplicates && 'opacity-45 line-through')}>
                    <TableCell className="text-muted-foreground">{r.rowNo}</TableCell>
                    <TableCell className="font-mono">{r.expenseDate}</TableCell>
                    <TableCell>{r.itemName ?? '-'}</TableCell>
                    <TableCell>{r.counterpartyText ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatKRW(r.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.categoryRaw ?? '-'}</TableCell>
                    <TableCell>
                      <select
                        aria-label={`${r.rowNo}행 항목`}
                        className={cn('h-7 rounded border bg-background px-1 text-xs', r.categoryId == null && 'border-accent-foreground/60')}
                        value={r.categoryId ?? ''}
                        onChange={(e) => setCategory(i, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">미지정</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nameKo}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      {r.duplicate ? <span className="text-accent-foreground">중복</span> : r.categoryId == null ? <span className="text-accent-foreground">항목 확인</span> : <span className="text-muted-foreground">등록 예정</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              등록 <b className="text-foreground">{toInsert.length.toLocaleString()}</b>건 · ₩{formatKRW(toInsert.reduce((a, r) => a + r.amount, 0))}
              {unmatched > 0 && ' · 미매칭 행은 항목 없이 등록됩니다'}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => router.push('/expenses')}>
                취소
              </Button>
              <Button disabled={pending || toInsert.length === 0} onClick={submit} className="gap-1.5">
                <Upload className="size-4" />
                {pending ? '등록 중...' : `${toInsert.length.toLocaleString()}건 등록`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
