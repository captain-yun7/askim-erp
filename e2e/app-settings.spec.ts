import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 관리자 설정: 거래 수정 표시 기간 — 저장·검증·상세 문구 반영 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const ACCT = { email: 'accountant@askim.local', password: 'askim2026!' }

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('admin: 1주 저장 → 상세 문구 7일 → 잘못된 값 거부 → 30일 복원', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')
  const input = page.getByLabel('기간 (일)')
  await expect(input).toHaveValue('30')
  await page.getByRole('button', { name: '1주' }).click()
  await expect(input).toHaveValue('7')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('7일로 저장')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('기간 (일)')).toHaveValue('7')

  // 거래 상세 문구 반영
  await page.goto('/deals?year=2026')
  await page.locator('tbody tr td:first-child a').first().click()
  await page.waitForURL(/\/deals\/[0-9a-f-]+/)
  const strip = page.getByText(/최근 \d+일 수정/)
  if (await strip.count()) await expect(strip).toContainText('최근 7일')

  await page.goto('/admin')
  await page.getByLabel('기간 (일)').fill('0')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('1일 이상')).toBeVisible()

  await page.getByLabel('기간 (일)').fill('30')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('30일로 저장')).toBeVisible()
})

test('회계는 관리자 페이지 접근 불가 (설정도 admin 전용)', async ({ page }) => {
  await login(page, ACCT)
  await page.goto('/admin')
  await page.waitForURL('http://localhost:3300/')
})
