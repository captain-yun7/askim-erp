'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { COST_GROUPS, COST_GROUP_LABEL, type CostGroup } from '@/lib/cost-groups'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ActionResult = { ok?: true; error?: string }

// ── 공통 행 편집 상태 헬퍼 ──────────────────────────────
function useSaver() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [savingId, setSavingId] = useState<number | null>(null)

  function save(id: number, run: () => Promise<ActionResult>) {
    setSavingId(id)
    startTransition(async () => {
      const res = await run()
      setSavingId(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('저장되었습니다')
      router.refresh()
    })
  }

  return { pending, savingId, save }
}

// ── 상품구분 (commissionRate 포함) ──────────────────────
export type DealCategoryRow = {
  id: number
  code: string
  nameKo: string
  commissionRate: string | null
  displayOrder: number
  memo: string | null
}

export function DealCategoryEditor({
  rows,
  action,
}: {
  rows: DealCategoryRow[]
  action: (
    id: number,
    raw: {
      nameKo: string
      commissionRate: string
      displayOrder: number
      memo: string
    },
  ) => Promise<ActionResult>
}) {
  const { pending, savingId, save } = useSaver()
  const [state, setState] = useState(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          nameKo: r.nameKo,
          commissionRate: r.commissionRate ?? '',
          displayOrder: String(r.displayOrder),
          memo: r.memo ?? '',
        },
      ]),
    ),
  )

  function set(id: number, k: string, v: string) {
    setState((p) => ({ ...p, [id]: { ...p[id], [k]: v } }))
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-28">코드</TableHead>
            <TableHead>명칭</TableHead>
            <TableHead className="w-32">요율</TableHead>
            <TableHead className="w-20">순서</TableHead>
            <TableHead>메모</TableHead>
            <TableHead className="w-20 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const s = state[r.id]
            return (
              <TableRow key={r.id} className="hover:bg-transparent">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.code}
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={s.nameKo}
                    onChange={(e) => set(r.id, 'nameKo', e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 font-mono"
                    value={s.commissionRate}
                    placeholder="0.05"
                    onChange={(e) => set(r.id, 'commissionRate', e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={s.displayOrder}
                    onChange={(e) => set(r.id, 'displayOrder', e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={s.memo}
                    onChange={(e) => set(r.id, 'memo', e.target.value)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={pending && savingId === r.id}
                    onClick={() =>
                      save(r.id, () =>
                        action(r.id, {
                          nameKo: s.nameKo,
                          commissionRate: s.commissionRate,
                          displayOrder: Number(s.displayOrder) || 0,
                          memo: s.memo,
                        }),
                      )
                    }
                  >
                    저장
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ── 단순 (code/nameKo/displayOrder) — account, salesMethod ──
export type SimpleLookupRow = {
  id: number
  code: string
  nameKo: string
  displayOrder: number
}

export function SimpleLookupEditor({
  rows,
  action,
}: {
  rows: SimpleLookupRow[]
  action: (
    id: number,
    raw: { nameKo: string; displayOrder: number },
  ) => Promise<ActionResult>
}) {
  const { pending, savingId, save } = useSaver()
  const [state, setState] = useState(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        { nameKo: r.nameKo, displayOrder: String(r.displayOrder) },
      ]),
    ),
  )

  function set(id: number, k: string, v: string) {
    setState((p) => ({ ...p, [id]: { ...p[id], [k]: v } }))
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-32">코드</TableHead>
            <TableHead>명칭</TableHead>
            <TableHead className="w-20">순서</TableHead>
            <TableHead className="w-20 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const s = state[r.id]
            return (
              <TableRow key={r.id} className="hover:bg-transparent">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.code}
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={s.nameKo}
                    onChange={(e) => set(r.id, 'nameKo', e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={s.displayOrder}
                    onChange={(e) => set(r.id, 'displayOrder', e.target.value)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={pending && savingId === r.id}
                    onClick={() =>
                      save(r.id, () =>
                        action(r.id, {
                          nameKo: s.nameKo,
                          displayOrder: Number(s.displayOrder) || 0,
                        }),
                      )
                    }
                  >
                    저장
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ── 거래항목 (costGroup 포함) ─────────────────────────
export type ExpenseCategoryRow = {
  id: number
  code: string
  nameKo: string
  costGroup: CostGroup
  displayOrder: number
}

export function ExpenseCategoryEditor({
  rows,
  action,
}: {
  rows: ExpenseCategoryRow[]
  action: (
    id: number,
    raw: { nameKo: string; costGroup: CostGroup; displayOrder: number },
  ) => Promise<ActionResult>
}) {
  const { pending, savingId, save } = useSaver()
  const [state, setState] = useState(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          nameKo: r.nameKo,
          costGroup: r.costGroup,
          displayOrder: String(r.displayOrder),
        },
      ]),
    ),
  )

  function set(id: number, patch: Partial<(typeof state)[number]>) {
    setState((p) => ({ ...p, [id]: { ...p[id], ...patch } }))
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-32">코드</TableHead>
            <TableHead>명칭</TableHead>
            <TableHead className="w-40">구분</TableHead>
            <TableHead className="w-20">순서</TableHead>
            <TableHead className="w-20 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const s = state[r.id]
            return (
              <TableRow key={r.id} className="hover:bg-transparent">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.code}
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={s.nameKo}
                    onChange={(e) => set(r.id, { nameKo: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <select
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                    value={s.costGroup}
                    onChange={(e) => set(r.id, { costGroup: e.target.value as CostGroup })}
                  >
                    {COST_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {COST_GROUP_LABEL[g]}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={s.displayOrder}
                    onChange={(e) => set(r.id, { displayOrder: e.target.value })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={pending && savingId === r.id}
                    onClick={() =>
                      save(r.id, () =>
                        action(r.id, {
                          nameKo: s.nameKo,
                          costGroup: s.costGroup,
                          displayOrder: Number(s.displayOrder) || 0,
                        }),
                      )
                    }
                  >
                    저장
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
