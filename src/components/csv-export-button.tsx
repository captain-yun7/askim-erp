'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ExportResult =
  | { ok: true; filename: string; csv: string }
  | { error: string }

export function CsvExportButton<F>({
  action,
  filters,
  label = 'CSV 내보내기',
}: {
  action: (filters: F) => Promise<ExportResult>
  filters: F
  label?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  function handleClick() {
    setBusy(true)
    startTransition(async () => {
      try {
        const res = await action(filters)
        if ('error' in res) {
          toast.error(res.error)
          return
        }
        // 직렬화 과정에서 선두 BOM이 유실될 수 있어 다운로드 시점에 보장 (엑셀 한글 호환)
        const body = res.csv.replace(/^﻿/, '')
        const blob = new Blob(['﻿', body], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = res.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch {
        toast.error('내보내기 중 오류가 발생했습니다')
      } finally {
        setBusy(false)
      }
    })
  }

  const loading = isPending || busy

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'gap-1.5',
        loading && 'opacity-60',
      )}
    >
      <Download className="size-4" />
      {loading ? '내보내는 중…' : label}
    </button>
  )
}
