'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginAction } from '@/server/actions/auth'

const LAST_EMAIL_KEY = 'askim-last-email'

export function LoginForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // 마지막으로 로그인한 아이디를 이 브라우저에 기억해 채워 준다 (2026-09-22 피드백). 비밀번호는 저장하지 않음.
  // 비제어 입력 — 제어 입력이면 하이드레이션 순간 사용자가 먼저 친 값이 지워질 수 있다
  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_EMAIL_KEY)
      const el = emailRef.current
      if (saved && el && el.value === '') {
        el.value = saved
        document.getElementById('password')?.focus()
      }
    } catch {}
  }, [])

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await loginAction(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      try {
        localStorage.setItem(LAST_EMAIL_KEY, String(formData.get('email') ?? '').trim())
      } catch {}
      router.push('/')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              ref={emailRef}
              defaultValue=""
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <div className="rounded-lg bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">
              {error}
            </div>
          )}
          <Button type="submit" size="lg" disabled={pending} className="mt-2">
            {pending ? '로그인 중...' : '로그인'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
