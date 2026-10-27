'use client'

import { useEffect, useState } from 'react'

/**
 * 엑셀처럼 금액 칸을 골라 합계·평균·개수 보기 (2026-10-23 요청).
 * 금액 칸(td[data-sum])을 끌면 범위, Ctrl(⌘)+클릭은 하나씩 더하고 빼기, Shift+클릭은 범위. Esc·빈 곳 클릭으로 해제.
 * 1,800행 표를 다시 그리지 않으려고 고른 칸 표시는 DOM 속성(data-picked)으로만 한다.
 */
export const SUM_COLUMNS = ['salesNet', 'salesVat', 'salesGross', 'purchaseNet', 'purchaseVat', 'purchaseGross', 'profit', 'profitKrw', 'incentiveAmount'] as const
export type SumColumn = (typeof SUM_COLUMNS)[number]

/** 표에 보이는 값(소수점 버림)과 같은 수로 더한다 */
export function sumAttrs(col: SumColumn, v: string | number | null | undefined) {
  const n = v == null || v === '' ? NaN : typeof v === 'string' ? parseFloat(v) : v
  return { 'data-sum': col, 'data-num': Number.isFinite(n) ? String(Math.trunc(n)) : undefined }
}

const keyOf = (td: HTMLElement) => `${td.closest<HTMLElement>('tr[data-row-id]')?.dataset.rowId}|${td.dataset.sum}`
/** 고른 칸 — 값은 고르는 순간 읽어 둔다 (칸을 눌러 고치면 선택이 풀리므로 값이 낡지 않는다) */
type Picked = { key: string; num: number | null }
const pick = (td: HTMLElement): Picked => ({ key: keyOf(td), num: td.dataset.num === undefined ? null : Number(td.dataset.num) })

export function CellSumBar({ container, version, fractional }: { container: React.RefObject<HTMLDivElement | null>; version: unknown; fractional: boolean }) {
  const [picked, setPicked] = useState<Picked[]>([])

  useEffect(() => {
    const root = container.current
    if (!root) return
    let anchor: string | null = null
    let drag: { start: string; last: string; moved: boolean; x: number; y: number; raf: number } | null = null
    // 끌거나 Ctrl·Shift 로 고른 직후의 클릭만 삼킨다 — 놓친 플래그가 나중 클릭을 먹지 않게 시간으로 제한
    let swallowUntil = 0
    const swallowNext = () => (swallowUntil = performance.now() + 500)

    const cellAt = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('td[data-sum]') : null)
    /** 두 칸을 꼭짓점으로 하는 사각형 안의 금액 칸 */
    const rect = (a: string, b: string) => {
      const trs = [...root.querySelectorAll<HTMLElement>('tr[data-row-id]')]
      const [ra, ca] = a.split('|')
      const [rb, cb] = b.split('|')
      const ia = trs.findIndex((tr) => tr.dataset.rowId === ra)
      const ib = trs.findIndex((tr) => tr.dataset.rowId === rb)
      const ja = SUM_COLUMNS.indexOf(ca as SumColumn)
      const jb = SUM_COLUMNS.indexOf(cb as SumColumn)
      if (ia < 0 || ib < 0) return []
      const out: Picked[] = []
      for (const tr of trs.slice(Math.min(ia, ib), Math.max(ia, ib) + 1))
        for (const td of tr.querySelectorAll<HTMLElement>('td[data-sum]')) {
          const j = SUM_COLUMNS.indexOf(td.dataset.sum as SumColumn)
          if (j >= Math.min(ja, jb) && j <= Math.max(ja, jb)) out.push(pick(td))
        }
      return out
    }
    const blurEditor = () => {
      const el = document.activeElement
      if (el instanceof HTMLElement && root.contains(el)) el.blur()
    }

    const extendTo = (td: HTMLElement) => {
      if (!drag) return
      const key = keyOf(td)
      if (key === drag.last) return
      drag.last = key
      if (!drag.moved) {
        drag.moved = true
        // 끄는 동안 글자 선택 대신 칸 선택
        root.style.userSelect = 'none'
        window.getSelection()?.removeAllRanges()
      }
      setPicked(rect(drag.start, key))
    }

    // 표 가장자리로 끌면 엑셀처럼 저절로 스크롤
    const scroller = () => root.querySelector<HTMLElement>('[data-slot=deals-scroll]')
    const autoScroll = () => {
      if (!drag) return
      const box = scroller()
      if (box) {
        const r = box.getBoundingClientRect()
        const top = r.top + (box.querySelector('thead')?.getBoundingClientRect().height ?? 0)
        const edge = 28
        const dy = drag.y > r.bottom - edge ? drag.y - (r.bottom - edge) : drag.y < top + edge ? drag.y - (top + edge) : 0
        const dx = drag.x > r.right - edge ? drag.x - (r.right - edge) : drag.x < r.left + edge ? drag.x - (r.left + edge) : 0
        if (drag.moved && (dx || dy)) {
          box.scrollBy(Math.max(-40, Math.min(40, dx)), Math.max(-40, Math.min(40, dy)))
          // 스크롤로 마우스 밑에 온 칸까지 넓힌다
          const x = Math.min(Math.max(drag.x, r.left + 2), r.right - 12)
          const y = Math.min(Math.max(drag.y, top + 2), r.bottom - 12)
          const td = cellAt(document.elementFromPoint(x, y))
          if (td && root.contains(td)) extendTo(td)
        }
      }
      drag.raf = requestAnimationFrame(autoScroll)
    }

    const onDown = (e: MouseEvent) => {
      swallowUntil = 0
      if (e.button !== 0) return
      const t = e.target as Element
      if (t.closest('input, select, textarea, [role=dialog]')) return
      const td = cellAt(t)
      const mod = e.metaKey || e.ctrlKey
      if (!td) {
        // 표 밖(위 일괄 수정 줄 등)이나 Ctrl+클릭(새 탭 열기)은 그대로 두고, 표 안 다른 칸을 누르면 해제
        if (!mod && !e.shiftKey && t.closest('table')) setPicked([])
        return
      }
      const key = keyOf(td)
      if (mod) {
        e.preventDefault()
        blurEditor()
        swallowNext()
        anchor = key
        setPicked((p) => (p.some((x) => x.key === key) ? p.filter((x) => x.key !== key) : [...p, pick(td)]))
        return
      }
      if (e.shiftKey && anchor) {
        e.preventDefault()
        blurEditor()
        swallowNext()
        setPicked(rect(anchor, key))
        return
      }
      anchor = key
      drag = { start: key, last: key, moved: false, x: e.clientX, y: e.clientY, raf: requestAnimationFrame(autoScroll) }
      setPicked([])
    }
    const onOver = (e: MouseEvent) => {
      if (!drag || !(e.buttons & 1)) return
      const td = cellAt(e.target)
      if (td) extendTo(td)
    }
    const onMove = (e: MouseEvent) => {
      if (!drag) return
      drag.x = e.clientX
      drag.y = e.clientY
    }
    const onUp = () => {
      if (!drag) return
      if (drag.moved) swallowNext()
      cancelAnimationFrame(drag.raf)
      drag = null
      root.style.userSelect = ''
    }
    // 끌거나 Ctrl·Shift 로 고른 뒤의 클릭은 금액 수정 창을 열지 않는다
    const onClick = (e: MouseEvent) => {
      if (performance.now() > swallowUntil || e.detail === 0) return
      swallowUntil = 0
      e.preventDefault()
      e.stopPropagation()
    }
    const onMenu = (e: MouseEvent) => {
      // 맥에서 Ctrl+클릭은 우클릭 메뉴로도 온다
      if (e.ctrlKey && cellAt(e.target)) e.preventDefault()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role=dialog]')) return
      setPicked((p) => (p.length ? [] : p))
    }
    root.addEventListener('mousedown', onDown)
    root.addEventListener('mouseover', onOver)
    root.addEventListener('click', onClick, true)
    root.addEventListener('contextmenu', onMenu)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      if (drag) cancelAnimationFrame(drag.raf)
      root.removeEventListener('mousedown', onDown)
      root.removeEventListener('mouseover', onOver)
      root.removeEventListener('click', onClick, true)
      root.removeEventListener('contextmenu', onMenu)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
      root.style.userSelect = ''
    }
  }, [container])

  // 고른 칸 표시 — 표가 다시 그려져도(version) 다시 칠한다. 칸을 한 번에 모아 찾는다 (수천 칸 선택 대비)
  useEffect(() => {
    const root = container.current
    if (!root) return
    for (const td of root.querySelectorAll<HTMLElement>('td[data-picked]')) delete td.dataset.picked
    if (!picked.length) return
    const want = new Set(picked.map((p) => p.key))
    for (const td of root.querySelectorAll<HTMLElement>('tr[data-row-id] td[data-sum]')) if (want.has(keyOf(td))) td.dataset.picked = ''
  }, [picked, version, container])

  const nums = picked.flatMap((p) => (p.num === null ? [] : [p.num]))
  const stats = picked.length ? { count: nums.length, sum: nums.reduce((a, n) => a + n, 0) } : null

  const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: fractional ? 2 : 0 })
  return (
    <div data-slot="cell-sum" aria-live="polite" className="flex shrink-0 items-center justify-end gap-4 border-t bg-muted/40 px-4 py-1.5 text-[12.5px]">
      {stats ? (
        <>
          <span>
            평균: <b className="tabular-nums">{stats.count ? fmt(stats.sum / stats.count) : '-'}</b>
          </span>
          <span>
            개수: <b className="tabular-nums">{stats.count.toLocaleString()}</b>
          </span>
          <span>
            합계: <b className="tabular-nums" data-slot="cell-sum-total">{fmt(stats.sum)}</b>
          </span>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setPicked([])}>
            선택 해제
          </button>
        </>
      ) : (
        <span className="text-muted-foreground">금액 칸을 마우스로 끌거나 Ctrl(⌘)+클릭으로 고르면 합계·평균이 보입니다</span>
      )}
    </div>
  )
}
