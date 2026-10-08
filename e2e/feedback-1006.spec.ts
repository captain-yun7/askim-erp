import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { fillRequiredDeal } from './helpers/deal-form'

/** 2026-10-06 요청사항 6건 (날짜 표기 · 결산연월 · 마이너스 매입 · 매출수단 칸 · VAT 구분 카드 · 필수값 검증) */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const rowOf = (page: Page, code: string) => page.locator('[data-slot=deals-scroll] tbody tr', { has: page.locator('td:first-child a', { hasText: new RegExp(`^${code}$`) }) })
const saved = (page: Page) => page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/deals')

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('① 날짜 칸은 필터·입력 모두 YYYY-MM-DD 로 안내한다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916-LEAD')
  await expect(page.getByLabel('fPurchaseInvoice 검색')).toHaveAttribute('placeholder', 'YYYY-MM-DD')
  await expect(page.getByLabel('fSalesInvoice 검색')).toHaveAttribute('placeholder', 'YYYY-MM-DD')
  const row = rowOf(page, 'E2E0916-LEAD')
  await row.locator('td:nth-child(18) button').click()
  await expect(page.getByLabel('purchaseInvoiceDate 입력')).toHaveAttribute('placeholder', 'YYYY-MM-DD')
  await page.keyboard.press('Escape')
})

test('② 목록의 결산 칸은 결산연월을 보여 주고 클릭해서 고친다 · 등록 화면에 결산예정일이 없다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916-LEAD')
  await expect(page.locator('thead')).toContainText('결산연월')
  await expect(page.locator('thead')).not.toContainText('결산예정일')
  const row = rowOf(page, 'E2E0916-LEAD')
  const cell = row.locator('td:nth-child(20)')
  await cell.getByTitle('클릭해서 결산연월 수정').click()
  await cell.getByLabel('결산연월 입력').fill('2026-11')
  await Promise.all([saved(page), cell.getByLabel('결산연월 입력').press('Enter')])
  await page.reload()
  await expect(rowOf(page, 'E2E0916-LEAD').locator('td:nth-child(20)')).toContainText('2026-11')

  await page.goto('/deals/new')
  await expect(page.locator('label', { hasText: '결산예정일' })).toHaveCount(0)
  await expect(page.locator('label', { hasText: '결산연도' })).toHaveCount(1)
  // 결산연도를 '26' 으로 쳐도 2026
  const year = page.locator('div:has(> label:text-is("결산연도")) input')
  await year.fill('26')
  await year.press('Tab')
  await expect(year).toHaveValue('2026')
})

test('③ 매입금이 마이너스인 거래도 결산 표시가 보인다', async ({ page }) => {
  execSync('npx tsx scripts/e2e-fixture-1006.ts', { stdio: 'inherit' })
  await login(page)
  await page.goto('/deals?fCode=E2E0916-MEMBER')
  const row = rowOf(page, 'E2E0916-MEMBER')
  await expect(row.locator('td:nth-child(15)')).toContainText(/결산/)
  await expect(row.locator('td:nth-child(15) button', { hasText: /결산/ })).toHaveCount(1)
})

test('④ 목록에 매출수단 칸이 있다 · ⑤ 합계 카드가 VAT 미포함/포함으로 나뉜다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?year=2026')
  await expect(page.locator('thead')).toContainText('매출수단')
  const vals = await page.locator('[data-col=salesMethod]').allInnerTexts()
  expect(vals.some((v) => v.trim() !== '-')).toBe(true)
  const cards = page.locator('[data-slot=vat-pair]')
  await expect(cards).toHaveCount(2)
  for (const c of await cards.all()) {
    await expect(c).toContainText('VAT 미포함')
    await expect(c).toContainText('VAT 포함')
    const nums = (await c.innerText()).match(/[\d,]+/g)!.map((t) => Number(t.replace(/,/g, '')))
    expect(nums[1]).toBeGreaterThanOrEqual(nums[0])
  }
})

test('⑥ 필수 항목이 비면 확정저장이 막히고 무엇이 비었는지 알려 준다 · 임시저장은 된다', async ({ page }) => {
  await login(page)
  await page.goto('/deals/new')
  await page.locator('div:has(> label:text-is("거래코드")) input').fill('E2E1006-REQ')
  await page.locator('div:has(> label:text-is("품목명")) input').fill('E2E거래0916-필수')
  await page.locator('div:has(> label:has-text("매출금")) input').first().fill('1000000')
  await page.getByRole('button', { name: '확정저장' }).click()
  const msg = page.getByText('필수 항목이 비어 있습니다')
  await expect(msg).toBeVisible()
  await expect(msg).toContainText('담당자')
  await expect(msg).toContainText('발행처')
  await expect(msg).toContainText('입금예정일')
  await expect(page).toHaveURL(/\/deals\/new/)

  await fillRequiredDeal(page, { item: 'E2E거래0916-필수', sales: '1000000' })
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  await page.goto('/deals/new')
  await page.locator('div:has(> label:text-is("거래코드")) input').fill('E2E1006-DRAFT')
  await page.locator('div:has(> label:text-is("품목명")) input').fill('E2E거래0916-초안')
  await page.getByRole('button', { name: '임시저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')
})
