'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { listHref, rememberList } from '@/lib/list-return'

/** 목록 화면에 두면 현재 필터 주소를 기억한다 */
export function RememberList({ path }: { path: string }) {
  const search = useSearchParams().toString()
  const router = useRouter()
  useEffect(() => {
    // 새로고침(F5)이면 검색·필터를 모두 지운 목록으로 (2026-10-08 요청: 새로고침하면 리셋되도록)
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav?.type === 'reload' && search && !sessionStorage.getItem(`askim-reload-reset:${path}`)) {
      try {
        sessionStorage.setItem(`askim-reload-reset:${path}`, '1')
      } catch {}
      rememberList(path, '')
      router.replace(path)
      return
    }
    try {
      sessionStorage.removeItem(`askim-reload-reset:${path}`)
    } catch {}
    rememberList(path, search)
  }, [path, search, router])
  return null
}

/** "← 목록" 링크 — 기억해 둔 필터 상태의 목록으로 돌아간다 */
export function ListBackLink({ path, className, children }: { path: string; className?: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <Link
      href={path}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        router.push(listHref(path))
      }}
    >
      {children}
    </Link>
  )
}
