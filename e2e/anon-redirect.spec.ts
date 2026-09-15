import { test, expect } from '@playwright/test'

/** 로그인 안 한 상태(세션 만료 포함)로 접근하면 빈 화면이 아니라 로그인 페이지 (2026-09-15 사고) */
test('비로그인 접근 → /login 으로 리다이렉트', async ({ page }) => {
  for (const path of ['/', '/deals', '/admin', '/reports/ledger']) {
    await page.goto(path)
    await page.waitForURL((u) => u.pathname === '/login')
    await expect(page.locator('#email')).toBeVisible()
  }
})

test('비로그인 API 접근 → 401 또는 로그인 리다이렉트', async ({ request }) => {
  const res = await request.get('/api/attachments/00000000-0000-0000-0000-000000000000', { maxRedirects: 0 })
  expect([302, 307, 401]).toContain(res.status())
})
