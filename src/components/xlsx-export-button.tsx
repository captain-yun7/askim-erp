'use client'

import { useTransition } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { XlsxResult } from '@/server/actions/report-export'

/** 리포트 엑셀 다운로드 버튼 — 서버 액션이 base64 xlsx 를 돌려주면 브라우저에서 저장 */
export function XlsxExportButton<F>({ action, filters, label = '엑셀 다운로드' }: { action: (f: F) => Promise<XlsxResult>; filters: F; label?: string }) {
  const [pending, start] = useTransition()
  function onClick() {
    start(async () => {
      const res = await action(filters)
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
  return (
    <button type="button" onClick={onClick} disabled={pending} className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5', pending && 'opacity-60')}>
      <FileSpreadsheet className="size-4" />
      {pending ? '만드는 중…' : label}
    </button>
  )
}
