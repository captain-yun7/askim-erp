'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { listHref, rememberList } from '@/lib/list-return'

/** 목록 화면에 두면 현재 필터 주소를 기억한다 */
export function RememberList({ path }: { path: string }) {
  const search = useSearchParams().toString()
  useEffect(() => {
    rememberList(path, search)
  }, [path, search])
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
