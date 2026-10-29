import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-09-22 고객 수정 요청 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }

async function login(page: Page, who: { email: string; password: string }) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
// 결과 없음 안내 행은 제외
const rows = (page: Page) => page.locator('[data-slot=deals-scroll] tbody tr', { has: page.locator('td:first-child a') })

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0917.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('① 계산서 발행일 — 공백 / 입력됨 필터', async ({ page }) => {
  await login(page, ADMIN)
  // 픽스처: A·B 만 매출계산서 발행일 있음
  await page.goto('/deals?fCode=E2E0917')
  const bar = page.locator('[data-slot=deals-bulk-bar]')
  // 하이드레이션 전 클릭은 상태에 안 잡히므로 작업 줄이 뜰 때까지 재시도
  await expect(async () => {
    await page.getByLabel('E2E0917-A 선택').check()
    await page.getByLabel('E2E0917-B 선택').check()
    await expect(bar).toContainText('2건 선택', { timeout: 1500 })
  }).toPass()
  await bar.getByLabel('일괄 발행일').fill('260901')
  await bar.getByRole('button', { name: '2건에 적용' }).click()
  await expect(page.getByText('매출계산서 발행일을 2건에')).toBeVisible()

  await page.getByLabel('fSalesInvoice 공백 여부').selectOption('-') // 공백
  await page.waitForURL((u) => u.searchParams.get('fSalesInvoice') === '-')
  expect((await rows(page).locator('td:first-child a').allInnerTexts()).sort()).toEqual(['E2E0917-ADMIN', 'E2E0917-C'])
  await page.getByLabel('fSalesInvoice 공백 여부').selectOption('+') // 입력됨
  await page.waitForURL((u) => u.searchParams.get('fSalesInvoice') === '+')
  expect((await rows(page).locator('td:first-child a').allInnerTexts()).sort()).toEqual(['E2E0917-A', 'E2E0917-B'])
  // 매입계산서 공백 — 픽스처 4건 모두 없음
  await page.getByLabel('fSalesInvoice 공백 여부').selectOption('')
  await page.waitForURL((u) => !u.searchParams.has('fSalesInvoice'))
  await page.getByLabel('fPurchaseInvoice 공백 여부').selectOption('-')
  await page.waitForURL((u) => u.searchParams.get('fPurchaseInvoice') === '-')
  await expect(rows(page)).toHaveCount(4)
  await page.getByLabel('fPurchaseInvoice 공백 여부').selectOption('+')
  await page.waitForURL((u) => u.searchParams.get('fPurchaseInvoice') === '+')
  await expect(rows(page)).toHaveCount(0)
})

test('② 로그인 — 마지막 아이디를 기억해 채워 준다 (비밀번호는 안 남김)', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/login')
  await expect(page.locator('#email')).toHaveValue('') // 기본값(admin@askim.local) 없음
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
  await page.goto('/logout')
  await page.goto('/login')
  await expect(page.locator('#email')).toHaveValue(ADMIN.email)
  await expect(page.locator('#password')).toHaveValue('')
  await expect(page.locator('#password')).toBeFocused()
})

test('③ 날짜 형식 — 보증금·판관비·감사로그 날짜 칸이 모두 같은 입력 방식', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deposits')
  await page.locator('[data-deposit-ready]').waitFor({ timeout: 30_000 })
  await page.locator('tbody tr').first().getByRole('button', { name: /수정/ }).click()
  const paid = page.getByRole('dialog').getByLabel('보증금 입금일')
  await expect(paid).toHaveAttribute('placeholder', /260917/)
  await paid.fill('250714')
  await paid.press('Tab')
  await expect(paid).toHaveValue('2025-07-14')
  await page.keyboard.press('Escape')

  await page.goto('/expenses/new')
  const d = page.getByLabel('지출일').first()
  await d.fill('20260922')
  await d.press('Tab')
  await expect(d).toHaveValue('2026-09-22')

  await page.goto('/admin/audit')
  await expect(page.getByLabel('시작일')).toHaveAttribute('placeholder', /260917/)
  // 남은 브라우저 기본 날짜 입력이 없어야 한다 (귀속연월의 month 선택은 예외)
  for (const path of ['/deposits', '/expenses/new', '/reports/plan', '/admin/audit']) {
    await page.goto(path)
    expect(await page.locator('input[type=date]:not([aria-hidden])').count()).toBe(0)
  }
})
