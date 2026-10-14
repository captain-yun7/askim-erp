import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-10-14 요청 — 추가 성과급 대상자(엑셀에서 성과금만 적던 행) */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const MEMBER = { email: 'member.e2e@askim.local', password: PW }

async function login(page: Page, who = ADMIN) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const rowOf = (page: Page, code: string) => page.locator('[data-slot=deals-scroll] tbody tr', { has: page.locator('td:first-child a', { hasText: new RegExp(`^${code}$`) }) })
const ready = async (page: Page) => {
  await page.locator('[data-bulk-ready]').waitFor({ timeout: 30_000 })
  const btn = page.locator('[data-overdue-dialog]').getByRole('button', { name: '확인' })
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click()
    await page.locator('[data-overdue-dialog]').waitFor({ state: 'detached' })
  }
}
const headers = (page: Page) => page.locator('[data-slot=deals-scroll] thead tr').first().locator('th').allInnerTexts()
async function switchTo(page: Page, entity: 'kr' | 'us') {
  await page.getByLabel('법인 선택').selectOption(entity)
  await expect(page.locator('[data-slot=entity-switcher]')).toHaveAttribute('data-entity', entity)
  await page.waitForLoadState('networkidle')
}

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('성과급 칸에서 추가 대상자를 넣으면 합계에 더해지고, 빼면 돌아온다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  const cell = rowOf(page, 'E2E0916-MEMBER').locator('[data-col=incentiveAmount]')
  // 손익 1,000,000 × 담당자 기본 5%
  await expect(cell).toHaveText('50,000')
  await cell.locator('[data-slot=incentive-amount]').click()
  const pop = page.locator('[data-slot=popover-content]')
  await pop.getByLabel('추가 대상자', { exact: true }).selectOption({ label: 'E2E팀장' })
  await pop.getByLabel('추가 대상자 요율').fill('10')
  await pop.getByRole('button', { name: '추가' }).click()
  await expect(cell.locator('[data-slot=share-count]')).toHaveText('+1')
  await expect(cell.locator('[data-slot=incentive-amount]')).toContainText('150,000')
  await expect(pop.locator('[data-share="E2E팀장"]')).toBeVisible()
  await page.waitForLoadState('networkidle')

  await page.reload()
  await ready(page)
  await expect(cell.locator('[data-slot=incentive-amount]')).toContainText('150,000')
  await cell.locator('[data-slot=incentive-amount]').click()
  await page.locator('[data-slot=popover-content]').getByRole('button', { name: 'E2E팀장 빼기' }).click()
  await expect(cell.locator('[data-slot=share-count]')).toHaveCount(0)
  await expect(cell.locator('[data-slot=incentive-amount]')).toHaveText('50,000')
})

test('다른 팀 영업에게는 그 거래와 성과급이 보이지 않는다', async ({ page }) => {
  // 타팀 영업은 E2E0916-MEMBER 거래를 볼 수 없어 성과급 칸 자체가 없다
  await login(page, { email: 'other.e2e@askim.local', password: PW })
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  await expect(rowOf(page, 'E2E0916-MEMBER')).toHaveCount(0)
})
