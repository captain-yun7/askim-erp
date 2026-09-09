import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 최근 수정 칸 음영 (2026-09-09 피드백) — 인라인 편집·토글 후 해당 칸만 음영, 상세에 수정 내역 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const ITEM = `E2E거래HL${Date.now()}`

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('새 거래는 음영 없음 → 금액 인라인 수정 → 매출 칸만 음영 → 결산 토글 → 입금/결산 칸 음영 → 상세에 내역', async ({ page }) => {
  await login(page)
  await page.goto('/deals/new')
  await page.locator('div:has(> label:text-is("품목명")) input').fill(ITEM)
  await page.locator('div:has(> label:has-text("매출금")) input').first().fill('1000000')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  await page.goto(`/deals?q=${encodeURIComponent(ITEM)}`)
  const row = page.locator('tbody tr').first()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(row.locator('td[data-changed]')).toHaveCount(0)

  // 매출금 인라인 수정
  await row.locator('td:nth-child(7) button').click()
  const input = row.locator('td:nth-child(7) input')
  await input.fill('2000000')
  await input.press('Enter')
  await expect(row.locator('td:nth-child(7)')).toHaveText(/2,000,000/)
  await expect(row.locator('td:nth-child(7)[data-changed]')).toHaveCount(1)
  await expect(row.locator('td:nth-child(8)[data-changed]')).toHaveCount(1) // 부가세도 같이 재계산
  await expect(row.locator('td:nth-child(12)[data-changed]')).toHaveCount(0)
  await expect(row.locator('td:nth-child(7)')).toHaveAttribute('title', /오늘 수정 · 관리자/)

  // 결산 토글
  await row.locator('td:nth-child(12) button').nth(1).click()
  await expect(row.locator('td:nth-child(12)')).toContainText('결산')
  await expect(row.locator('td:nth-child(12)[data-changed]')).toHaveCount(1)
  await expect(row.locator('td:nth-child(16)[data-changed]')).toHaveCount(1) // 결산일 자동 입력

  // 상세 화면 내역
  await row.locator('td:first-child a').click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+/)
  const strip = page.getByText(/최근 \d+일 수정/).locator('..')
  await expect(strip).toContainText('매출금')
  await expect(strip).toContainText('결산여부')
})
