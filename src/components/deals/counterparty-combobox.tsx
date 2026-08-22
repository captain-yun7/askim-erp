'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Item = { id: string; name: string; businessNo: string | null }

/**
 * 거래처 자동완성 콤보박스.
 * - 열리면 즉시 상위 목록, 글자 입력시 /api/counterparties/search 재조회 (㈜/공백 무시)
 * - 마스터에 없으면 [신규 등록] 옵션 → onCreateRequest 콜백
 */
export function CounterpartyCombobox({
  value,
  initialLabel,
  onChange,
  onCreateRequest,
  placeholder = '거래처 검색...',
}: {
  value: string | null
  initialLabel?: string | null
  onChange: (id: string | null, label: string | null) => void
  onCreateRequest?: (name: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [label, setLabel] = useState(initialLabel ?? '')
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setLabel(initialLabel ?? ''), [initialLabel])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (!open) {
      setItems([])
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/counterparties/search?q=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d) => setItems(d.items ?? []))
        .finally(() => setLoading(false))
    }, 150)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, open])

  function select(item: Item) {
    onChange(item.id, item.name)
    setLabel(item.name)
    setQuery('')
    setOpen(false)
  }

  function clear() {
    onChange(null, null)
    setLabel('')
    setQuery('')
  }

  return (
    <div className="relative" ref={ref}>
      <div
        className={cn(
          'flex h-8 cursor-text items-center justify-between rounded-lg border border-input bg-background px-2.5 text-sm',
          'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        )}
        onClick={() => setOpen(true)}
      >
        {value && label && !open ? (
          <span className="flex-1 truncate text-zinc-900">{label}</span>
        ) : (
          <input
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder={placeholder}
            value={open ? query : label}
            onChange={(e) => {
              setOpen(true)
              setQuery(e.target.value)
              if (!e.target.value) setLabel('')
            }}
            onFocus={() => setOpen(true)}
          />
        )}
        <div className="flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                clear()
              }}
              className="text-zinc-400 hover:text-zinc-700"
              aria-label="지우기"
            >
              <X className="size-3.5" />
            </button>
          )}
          <ChevronDown className="size-3.5 text-zinc-400" />
        </div>
      </div>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-xs text-zinc-500">검색 중...</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-500">검색 결과 없음</div>
          )}
          <div className="max-h-64 overflow-y-auto">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => select(it)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
            >
              <span>{it.name}</span>
              {it.businessNo && (
                <span className="text-xs text-zinc-500">{it.businessNo}</span>
              )}
            </button>
          ))}
          </div>
          {query && onCreateRequest && (
            <button
              type="button"
              onClick={() => {
                onCreateRequest(query)
                setOpen(false)
              }}
              className="flex w-full items-center gap-1 border-t bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100"
            >
              <Plus className="size-3.5" />
              <span>&lsquo;{query}&rsquo; 신규 등록</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
