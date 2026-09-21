'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteExpenses } from '@/server/actions/expenses'

/**
 * 판관비 목록 여러 건 삭제 (2026-09-17 피드백). 표는 서버에서 그리므로 체크박스는 비제어 input 이고,
 * 여기서 컨테이너의 change 이벤트만 모아 선택 건수를 센다. 확인 메시지는 한 번만.
 */
export function ExpensesBulkBar({ containerId }: { containerId: string }) {
  const router = useRouter()
  const [ids, setIds] = useState<string[]>([])
  const [pending, start] = useTransition()

  useEffect(() => {
    const root = document.getElementById(containerId)
    if (!root) return
    const boxes = () => [...root.querySelectorAll<HTMLInputElement>('input[data-row-select]')]
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement
      if (t.matches?.('input[data-select-all]')) for (const b of boxes()) b.checked = t.checked
      else if (!t.matches?.('input[data-row-select]')) return
      setIds(boxes().filter((b) => b.checked).map((b) => b.dataset.id!))
    }
    root.addEventListener('change', onChange)
    return () => root.removeEventListener('change', onChange)
  }, [containerId])

  function clear() {
    const root = document.getElementById(containerId)
    if (root) for (const b of root.querySelectorAll<HTMLInputElement>('input[data-row-select], input[data-select-all]')) b.checked = false
    setIds([])
  }

  if (ids.length === 0) return null
  return (
    <div data-slot="expenses-bulk-bar" className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-[12.5px]">
      <span>
        <b>{ids.length}</b>건 선택
      </span>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 gap-1.5"
        disabled={pending}
        onClick={() => {
          if (!confirm(`선택한 판관비 ${ids.length}건을 삭제하시겠습니까?`)) return
          start(async () => {
            const res = await deleteExpenses(ids)
            if ('error' in res) {
              toast.error(res.error)
              return
            }
            toast.success(`판관비 ${res.deleted}건을 삭제했습니다`, res.skipped ? { description: `권한이 없는 ${res.skipped}건은 건너뛰었습니다` } : undefined)
            clear()
            router.refresh()
          })
        }}
      >
        <Trash2 className="size-3.5" />
        {pending ? '삭제 중...' : '선택 삭제'}
      </Button>
      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={clear}>
        선택 해제
      </button>
    </div>
  )
}
