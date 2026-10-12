'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { listHref, rememberList } from '@/lib/list-return'

/** 새로고침 뒤 첫 마운트에서만 초기화한다 — navigation.type 은 같은 문서 안에서 계속 'reload' 라 모듈 변수로 한 번만 (2026-10-12 필터가 몇 초 뒤 풀리던 버그) */
let reloadHandled = false

/** 목록 화면에 두면 현재 필터 주소를 기억한다 */
export function RememberList({ path }: { path: string }) {
  const search = useSearchParams().toString()
  const router = useRouter()
  useEffect(() => {
    // 새로고침(F5)이면 검색·필터를 모두 지운 목록으로 (2026-10-08 요청: 새로고침하면 리셋되도록)
    if (!reloadHandled) {
      reloadHandled = true
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav?.type === 'reload' && search) {
        rememberList(path, '')
        router.replace(path)
        return
      }
    }
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
