import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('#email', 'admin@askim.local')
  await page.fill('#password', 'askim2026!')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('/')
}

test('월과 항목을 고르면 판관비가 100건에서 잘리지 않는다', async ({ page }) => {
  await login(page)
  await page.goto('/expenses?year=2026&month=4&categoryId=1')
  const total = Number((await page.locator('[data-slot=expenses-total]').innerText()).replace(/,/g, ''))
  expect(total).toBeGreaterThan(100)
  await expect(page.locator('#expenses-table tbody tr')).toHaveCount(total)
  await expect(page.locator('[data-slot=expenses-truncated]')).toHaveCount(0)
  await expect(page.locator('#expenses-table tbody tr').last()).toContainText('2026-04-0')
})

test('필터가 없으면 최근 100건과 안내가 보인다', async ({ page }) => {
  await login(page)
  await page.goto('/expenses')
  await expect(page.locator('#expenses-table tbody tr')).toHaveCount(100)
  await expect(page.locator('[data-slot=expenses-truncated]')).toBeVisible()
})
