'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { saveTeamShareGroups } from '@/server/actions/app-settings'

const same = (a: string[][], b: string[][]) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 관리자 홈 — 함께 보는 팀 묶음 (2026-09-21 요청: 해외영업팀·중국사업부가 서로의 거래를 조회·수정).
 * 묶음 안 팀의 영업 계정은 팀장이 아니어도 서로의 거래·보증금을 보고 거래를 수정할 수 있다.
 */
export function TeamShareGroupsSetting({ current, teams }: { current: string[][]; teams: string[] }) {
  const [groups, setGroups] = useState<string[][]>(current)
  const [saved, setSaved] = useState<string[][]>(current)
  const [pending, start] = useTransition()
  const dirty = !same(groups, saved)
  const usedElsewhere = (gi: number, team: string) => groups.some((g, i) => i !== gi && g.includes(team))

  function toggle(gi: number, team: string) {
    setGroups((prev) => prev.map((g, i) => (i !== gi ? g : g.includes(team) ? g.filter((t) => t !== team) : [...g, team])))
  }

  function save() {
    const cleaned = groups.filter((g) => g.length > 0)
    if (cleaned.some((g) => g.length < 2)) {
      toast.error('묶음에는 팀을 2개 이상 선택하세요')
      return
    }
    start(async () => {
      const res = await saveTeamShareGroups(cleaned)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setGroups(res.groups)
      setSaved(res.groups)
      toast.success(res.groups.length ? `팀 묶음 ${res.groups.length}개를 저장했습니다` : '팀 묶음을 모두 해제했습니다')
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-5 sm:col-span-2" data-slot="team-share-groups">
      <div className="font-medium">함께 보는 팀 묶음</div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        같은 묶음에 넣은 팀의 영업 계정은 팀장이 아니어도 서로의 거래·보증금을 조회하고, 거래를 수정(금액·날짜·입금/결산·첨부)할 수 있습니다. 삭제는 본인 거래만 가능합니다. 묶음에 없는 팀은 지금처럼 본인 것만 봅니다.
      </p>

      <div className="mt-3 grid gap-2.5">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">묶음이 없습니다.</p>}
        {groups.map((g, gi) => (
          <div key={gi} className="rounded-xl border px-3 py-2.5" data-slot="team-share-group">
            <div className="mb-2 flex items-center justify-between text-[12.5px]">
              <span className="font-medium">
                묶음 {gi + 1}
                <span className="ml-2 font-normal text-muted-foreground">{g.length ? g.join(' · ') : '팀을 선택하세요'}</span>
              </span>
              <button
                type="button"
                aria-label={`묶음 ${gi + 1} 삭제`}
                className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setGroups((prev) => prev.filter((_, i) => i !== gi))}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {teams.map((t) => {
                const taken = usedElsewhere(gi, t)
                return (
                  <label key={t} className={`flex items-center gap-1.5 text-[13px] ${taken ? 'cursor-not-allowed text-muted-foreground/50' : 'cursor-pointer'}`} title={taken ? '다른 묶음에 들어 있는 팀입니다' : undefined}>
                    <Checkbox checked={g.includes(t)} disabled={taken} onCheckedChange={() => toggle(gi, t)} />
                    {t}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="outline" type="button" className="gap-1" onClick={() => setGroups((prev) => [...prev, []])}>
          <Plus className="size-3.5" />묶음 추가
        </Button>
        <Button size="sm" disabled={pending || !dirty} onClick={save}>
          {pending ? '적용 중...' : '묶음 적용'}
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">&quot;묶음 적용&quot;을 눌러야 반영됩니다</span>}
      </div>
    </div>
  )
}
