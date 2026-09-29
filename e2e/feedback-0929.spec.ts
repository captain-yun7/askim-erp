import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-09-29 긴급 요청 — 거래 목록 필터가 두 개 같이 안 걸림, 뒤로가기·새로고침 뒤 필터가 안 먹음 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const MEMBER = { email: 'member.e2e@askim.local', password: PW }

async function login(page: Page, who: { email: string; password: string }) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}

const rows = (page: Page) => page.locator('[data-slot=deals-scroll] tbody tr')
const codes = (page: Page) => page.locator('[data-slot=deals-scroll] tbody tr td:first-child a').allInnerTexts()
const supplier = (page: Page) => page.getByLabel('fSupplier 검색')
const due = (page: Page) => page.getByLabel('fPurchaseDue 검색')
const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key)

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('결산예정 필터와 다른 필터를 같이 걸면 둘 다 적용된다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fSupplier=나스')
  const onlySupplier = await rows(page).count()
  await page.goto('/deals?fPurchaseDue=2026-09')
  const onlyDue = await rows(page).count()
  await page.goto('/deals?fSupplier=나스&fPurchaseDue=2026-09')
  await expect(rows(page).first()).toBeVisible()
  const both = await rows(page).count()
  expect(both).toBeLessThanOrEqual(Math.min(onlySupplier, onlyDue))
  for (const name of await page.locator('[data-slot=deals-scroll] tbody tr td[data-col=supplier]').allInnerTexts()) expect(name).toContain('나스')
  // 거래코드 필터와도 같이
  await page.goto('/deals?fCode=E2E0916-LEAD&fPurchaseDue=%2B')
  expect((await codes(page)).every((c) => c === 'E2E0916-LEAD')).toBe(true)
})

test('필터를 연달아 걸어도 앞 필터가 사라지지 않는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  await supplier(page).fill('나스')
  await supplier(page).press('Enter')
  await due(page).fill('2026-09')
  await due(page).press('Enter')
  await expect.poll(() => param(page, 'fPurchaseDue')).toBe('2026-09')
  expect(param(page, 'fSupplier')).toBe('나스')
})

test('입력만 해 둔 칸도 다른 칸에서 Enter 를 누르면 같이 적용된다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  await supplier(page).fill('나스')
  await due(page).fill('2026-09')
  await due(page).press('Enter')
  await expect.poll(() => param(page, 'fSupplier')).toBe('나스')
  expect(param(page, 'fPurchaseDue')).toBe('2026-09')
})

test('뒤로가기·새로고침 뒤에도 칸의 글자와 실제 필터가 같고 다시 걸린다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  const all = await rows(page).count()
  await supplier(page).fill('나스')
  await supplier(page).press('Enter')
  await expect.poll(() => rows(page).count()).toBeLessThan(all)
  const filtered = await rows(page).count()

  await page.goBack()
  await expect(supplier(page)).toHaveValue('')
  await expect.poll(() => rows(page).count()).toBe(all)

  await page.goForward()
  await expect(supplier(page)).toHaveValue('나스')
  await expect.poll(() => rows(page).count()).toBe(filtered)

  await page.reload()
  await expect(supplier(page)).toHaveValue('나스')
  await due(page).fill('2026-09')
  await due(page).press('Enter')
  await expect.poll(() => param(page, 'fPurchaseDue')).toBe('2026-09')
  expect(param(page, 'fSupplier')).toBe('나스')

  await supplier(page).fill('')
  await supplier(page).press('Enter')
  await expect.poll(() => param(page, 'fSupplier')).toBeNull()
  expect(param(page, 'fPurchaseDue')).toBe('2026-09')
})

test('결산예정 필터를 걸어도 영업 팀원은 본인 거래만 본다', async ({ page }) => {
  await login(page, MEMBER)
  for (const q of ['%2B', '2026', '-']) {
    await page.goto(`/deals?fPurchaseDue=${q}`)
    await page.waitForLoadState('networkidle')
    const list = await codes(page)
    expect(list.filter((c) => c !== 'E2E0916-MEMBER')).toEqual([])
  }
})
