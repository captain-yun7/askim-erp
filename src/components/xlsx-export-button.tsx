'use client'

import { useTransition } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { XlsxResult } from '@/server/actions/report-export'

/** 리포트 엑셀 다운로드 버튼 — 서버 액션이 base64 xlsx 를 돌려주면 브라우저에서 저장 */
export function XlsxExportButton<F>({ action, filters, label = '엑셀 다운로드', iconOnly = false }: { action: (f: F) => Promise<XlsxResult>; filters: F; label?: string; iconOnly?: boolean }) {
  const [pending, start] = useTransition()
  function onClick() {
    start(async () => {
      const res = await action(filters).catch(() => ({ error: '내보내기 중 오류가 발생했습니다' }))
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    })
  }
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title={pending ? '만드는 중…' : label}
        aria-label={label}
        className={cn('grid size-9 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-muted', pending && 'opacity-60')}
      >
        <Download className="size-4" />
      </button>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={pending} className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5', pending && 'opacity-60')}>
      <FileSpreadsheet className="size-4" />
      {pending ? '만드는 중…' : label}
    </button>
  )
}
