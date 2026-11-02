'use client'

import { useEffect, useRef } from 'react'

/**
 * 주소의 필터 값과 검색칸 글자를 맞춘다 — 단, 사용자가 이미 다른 글자를 치고 있으면 덮어쓰지 않는다.
 * key 로 칸을 새로 그리던 방식은 앞 검색 결과가 늦게 도착하면 새로 친 글자와 커서를 지워서
 * Enter 가 먹지 않았다 (2026-11-02 '지우고 다른 거 입력하면 새로고침해야 반영').
 */
export function useSyncedInput(value: string) {
  const ref = useRef<HTMLInputElement>(null)
  const shown = useRef(value)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 마지막으로 맞춰 둔 글자 그대로면(손대지 않았으면) 새 값으로, 고쳐 쓰는 중이면 그대로 둔다
    if (el.value === shown.current) el.value = value
    shown.current = value
  }, [value])
  return ref
}
