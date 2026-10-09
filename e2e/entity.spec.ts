import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { fillRequiredDeal } from './helpers/deal-form'

/** 2026-10-08 요청 — 좌측 상단 법인 선택, 법인별 데이터 분리 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const codes = (page: Page) => page.locator('[data-slot=deals-scroll] tbody tr td:first-child a').allInnerTexts()
const switcher = (page: Page) => page.locator('[data-slot=entity-switcher]')
async function switchTo(page: Page, entity: 'kr' | 'us' | 'cn') {
  await page.getByLabel('법인 선택').selectOption(entity)
  await expect(switcher(page)).toHaveAttribute('data-entity', entity)
  await page.waitForLoadState('networkidle')
}

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
  execSync('npx tsx scripts/e2e-fixture-entity.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('기본은 한국법인이고, 미국법인으로 바꾸면 미국 거래·거래처만 보인다', async ({ page }) => {
  await login(page)
  await expect(switcher(page)).toHaveAttribute('data-entity', 'kr')
  await expect(switcher(page)).toContainText('한국법인')

  await page.goto('/deals?fCode=E2E')
  let list = await codes(page)
  expect(list).toContain('E2E0916-LEAD')
  expect(list).not.toContain('E2EUS-1')

  await switchTo(page, 'us')
  await page.goto('/deals?fCode=E2E')
  list = await codes(page)
  expect(list).toEqual(['E2EUS-1'])
  await page.goto('/counterparties?q=E2E거래처')
  const names = await page.locator('tbody tr a').allInnerTexts()
  expect(names).toEqual(['E2E거래처US-A'])
  // 리포트도 미국법인 기준 (한국 거래가 섞이지 않음)
  await page.goto('/reports/ledger?year=2026&half=h2')
  const sept = await page.locator('tr[data-row="sales_accrual"] td').nth(5).innerText()
  expect(Number(sept.replace(/[^\d-]/g, ''))).toBe(15000)

  await switchTo(page, 'kr')
  await page.goto('/deals?fCode=E2E')
  list = await codes(page)
  expect(list).toContain('E2E0916-LEAD')
  expect(list).not.toContain('E2EUS-1')
})

test('미국법인에서 등록한 거래는 미국법인에만 있다', async ({ page }) => {
  await login(page)
  await switchTo(page, 'us')
  await page.goto('/deals/new')
  await page.waitForLoadState('networkidle')
  await fillRequiredDeal(page, { code: 'E2EUS-NEW', item: 'E2E거래US-new', sales: '2000', counterparty: 'E2E거래처US' })
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')
  await page.goto('/deals?fCode=E2EUS')
  expect((await codes(page)).sort()).toEqual(['E2EUS-1', 'E2EUS-NEW'])

  await switchTo(page, 'kr')
  await page.goto('/deals?fCode=E2EUS')
  expect(await codes(page)).toEqual([])
  // 같은 코드를 한국법인에서 쓸 수 있다 (법인 안에서만 유일)
  await page.goto('/deals/new')
  await page.waitForLoadState('networkidle')
  await fillRequiredDeal(page, { code: 'E2EUS-NEW', item: 'E2E거래0916-같은코드', sales: '1000' })
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')
  await page.goto('/deals?fCode=E2EUS-NEW')
  expect(await codes(page)).toEqual(['E2EUS-NEW'])
})
