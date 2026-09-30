import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-09-29 요청(부가세파트 외) — 부가세 "삭제" 버튼, 금액 소수점 버림 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}

const field = (page: Page, label: string) => page.locator(`div:has(> label:text-is("${label}")) input`).first()
const vatToggle = (page: Page, side: '매출' | '매입') => page.locator('[data-slot=vat-toggle]').nth(side === '매출' ? 0 : 1)
const vatInput = (page: Page, side: '매출' | '매입') => page.locator('div:has(> div > [data-slot=vat-toggle]) input').nth(side === '매출' ? 0 : 1)

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('부가세 자동 계산은 그대로, "삭제"를 누르면 비워지고 금액을 고쳐도 다시 채워지지 않는다', async ({ page }) => {
  await login(page)
  await page.goto('/deals/new')
  await field(page, '매출금').fill('1000000')
  await expect(vatInput(page, '매출')).toHaveValue('100,000')
  await expect(field(page, '총매출')).toHaveValue('1,100,000')

  await vatToggle(page, '매출').click()
  await expect(vatInput(page, '매출')).toHaveValue('')
  await expect(field(page, '총매출')).toHaveValue('1,000,000')
  await expect(vatToggle(page, '매출')).toHaveText('10% 계산')

  await field(page, '매출금').fill('2000000')
  await expect(vatInput(page, '매출')).toHaveValue('')
  await expect(field(page, '총매출')).toHaveValue('2,000,000')

  // 다시 계산
  await vatToggle(page, '매출').click()
  await expect(vatInput(page, '매출')).toHaveValue('200,000')
  await expect(field(page, '총매출')).toHaveValue('2,200,000')
  await expect(vatToggle(page, '매출')).toHaveText('삭제')

  // 매입 쪽은 따로 움직인다
  await field(page, '매입금').fill('500000')
  await expect(vatInput(page, '매입')).toHaveValue('50,000')
  await vatToggle(page, '매입').click()
  await expect(field(page, '총매입')).toHaveValue('500,000')
  await expect(vatInput(page, '매출')).toHaveValue('200,000')
})

test('부가세를 삭제해 저장하면 목록·상세에 그대로 남고, 목록에서 금액을 고쳐도 부가세가 생기지 않는다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916-LEAD')
  await page.locator('[data-slot=deals-scroll] tbody tr td:first-child a').first().click()
  await page.waitForURL((u) => /^\/deals\/.+/.test(u.pathname))
  await expect(vatInput(page, '매출')).toHaveValue('100,000')
  await vatToggle(page, '매출').click()
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  const row = page.locator('[data-slot=deals-scroll] tbody tr').first()
  await expect(row.locator('[data-col=salesGross]')).toHaveText('1,000,000')

  // 목록에서 매출금 바로 수정
  await row.locator('td:nth-child(9) button').click()
  await row.locator('td:nth-child(9) input').fill('3000000')
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/deals'),
    row.locator('td:nth-child(9) input').press('Enter'),
  ])
  await page.reload()
  await expect(row.locator('td:nth-child(9)')).toHaveText(/3,000,000/)
  await expect(row.locator('[data-col=salesGross]')).toHaveText('3,000,000')

  // 상세를 다시 열어도 "부가세 없음" 상태
  await row.locator('td:first-child a').click()
  await page.waitForURL((u) => /^\/deals\/.+/.test(u.pathname))
  await expect(vatInput(page, '매출')).toHaveValue('')
  await expect(vatToggle(page, '매출')).toHaveText('10% 계산')
})

test('부가세가 있는 거래는 목록에서 금액을 고치면 전처럼 10% 가 다시 계산된다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916-MEMBER')
  const row = page.locator('[data-slot=deals-scroll] tbody tr').first()
  await row.locator('td:nth-child(9) button').click()
  await row.locator('td:nth-child(9) input').fill('2000000')
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/deals'),
    row.locator('td:nth-child(9) input').press('Enter'),
  ])
  await page.reload()
  await expect(row.locator('[data-col=salesGross]')).toHaveText('2,200,000')
})

test('원화 금액은 소수점 아래를 버리고 보여 주며 소수점 입력도 받지 않는다', async ({ page }) => {
  await login(page)
  await page.goto('/deals/new')
  await field(page, '매입금').pressSequentially('90786.8')
  await expect(field(page, '매입금')).toHaveValue('907,868')
  await field(page, '매입금').fill('')
  await field(page, '매입금').fill('90786.8')
  await expect(field(page, '매입금')).toHaveValue('90,786')
  await vatToggle(page, '매입').click()
  await expect(field(page, '총매입')).toHaveValue('90,786')
})
