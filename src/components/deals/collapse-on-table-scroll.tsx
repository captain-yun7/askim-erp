'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * 거래 표를 아래로 스크롤하면 요약 카드를 접어 표에 자리를 내준다 (2026-09-16 피드백: 고정 영역은 검색·필터·요약줄·헤더).
 * 표를 맨 위로 되돌리면 다시 펼친다. 접힘/펼침 기준을 다르게 둬서 높이 변화로 인한 깜빡임을 막는다.
 */
export function CollapseOnTableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement | null
      if (!el?.matches?.('[data-slot=deals-scroll]')) return
      setCollapsed((prev) => (prev ? el.scrollTop > 0 : el.scrollTop > 24))
    }
    // scroll 은 버블링하지 않으므로 캡처 단계에서 받는다
    document.addEventListener('scroll', onScroll, true)
    // 하이드레이션 전에 이미 스크롤했을 수 있으므로 현재 위치도 한 번 반영
    const raf = requestAnimationFrame(() => {
      const box = document.querySelector<HTMLElement>('[data-slot=deals-scroll]')
      if (box && box.scrollTop > 24) setCollapsed(true)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  return (
    <div
      data-slot="deals-summary"
      data-collapsed={collapsed || undefined}
      aria-hidden={collapsed || undefined}
      className={cn(
        'grid shrink-0 transition-[grid-template-rows,opacity,margin] duration-200 ease-out',
        collapsed ? 'mt-0 grid-rows-[0fr] opacity-0' : 'mt-5 grid-rows-[1fr] opacity-100',
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
