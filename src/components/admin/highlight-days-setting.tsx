'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveChangeHighlightDays } from '@/server/actions/app-settings'

/** 관리자 홈 — 최근 수정 칸 음영 기간 설정 */
export function HighlightDaysSetting({ current }: { current: number }) {
  const router = useRouter()
  const [value, setValue] = useState(String(current))
  const [pending, start] = useTransition()
  const dirty = value.trim() !== String(current)

  function save() {
    start(async () => {
      const res = await saveChangeHighlightDays(value)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(`수정 표시 기간이 ${res.days}일로 저장되었습니다`)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="font-medium">거래 수정 표시 기간</div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        누군가 거래의 칸을 고치면 그 칸이 노란색으로 표시됩니다. 며칠 동안 표시할지 정하세요 (1~365일).
      </p>
      <div className="mt-3 flex items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="highlight-days">기간 (일)</Label>
          <Input
            id="highlight-days"
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            className="w-28 text-right"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && dirty && save()}
          />
        </div>
        <Button size="sm" className="gap-1" onClick={() => setValue('7')} variant="outline" type="button">
          1주
        </Button>
        <Button size="sm" onClick={() => setValue('30')} variant="outline" type="button">
          1달
        </Button>
        <Button size="sm" disabled={pending || !dirty} onClick={save}>
          {pending ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
