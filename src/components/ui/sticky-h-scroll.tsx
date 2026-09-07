'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * 가로 스크롤 영역 + 화면 하단 고정 스크롤바.
 * 긴 표는 자체 스크롤바가 표 맨 아래에 숨어 있어 오른쪽 컬럼을 볼 방법이 없다는 피드백(2026-09-07) 대응.
 * 조상 요소에 overflow-hidden/auto 가 있으면 sticky 가 그 요소 기준이 되므로 overflow-clip 을 써야 한다.
 */
export function StickyHScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = useState(0)
  // 하이드레이션 전에는 측정값이 없으므로 일단 보이게 두고, 실측 후 표가 다 들어오면 숨김
  const [fits, setFits] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => {
      setScrollWidth(el.scrollWidth)
      setFits(el.scrollWidth <= el.clientWidth)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])

  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || from.scrollLeft === to.scrollLeft) return
    to.scrollLeft = from.scrollLeft
  }

  return (
    <div className={className}>
      <div
        ref={contentRef}
        data-slot="sticky-h-scroll-content"
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={() => sync(contentRef.current, barRef.current)}
      >
        {children}
      </div>
      <div
        ref={barRef}
        data-slot="sticky-h-scroll-bar"
        hidden={fits}
        className={cn(
          'sticky bottom-0 z-20 overflow-x-auto overflow-y-hidden border-t bg-card',
          // scrollbar-width 를 함께 지정하면 Chrome 121+ 가 ::-webkit-scrollbar 를 무시해 macOS 에서 오버레이(안 보임)가 됨
          '[&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-muted/60',
          '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/50',
        )}
        onScroll={() => sync(barRef.current, contentRef.current)}
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
    </div>
  )
}
