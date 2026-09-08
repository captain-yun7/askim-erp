import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * 베타 가동 전 권한 정리 (2026-09-07)
 * ① admin 비밀번호 초기화 → 임시 비밀번호로 로그인
 * ② 회계 판관비 수정·삭제
 * ③ viewer: 입력 버튼 숨김·입력 페이지 차단·거래처 상세 읽기전용
 */

const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const ACCT = { email: 'accountant@askim.local', password: 'askim2026!' }
const VIEWER = { email: 'viewer.e2e@askim.local', password: 'askim2026!' }

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-beta.ts', { stdio: 'inherit' })
})

test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test.describe.serial('① 비밀번호 초기화', () => {
  let temp = ''

  test('admin: 임시 비밀번호 발급', async ({ page }) => {
    await login(page, ADMIN)
    await page.goto('/admin/users')
    const row = page.locator('tbody tr', { hasText: VIEWER.email })
    page.once('dialog', (d) => d.accept())
    await row.getByRole('button', { name: '비번 초기화' }).click()
    const code = page.getByTestId('temp-password')
    await expect(code).toBeVisible()
    temp = (await code.innerText()).trim()
    expect(temp).toMatch(/^[A-Za-z0-9]{10}$/)
  })

  test('기존 비밀번호는 실패, 임시 비밀번호로 로그인 성공', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', VIEWER.email)
    await page.fill('#password', VIEWER.password)
    await page.getByRole('button', { name: '로그인' }).click()
    await expect(page).toHaveURL(/\/login/)

    await login(page, { email: VIEWER.email, password: temp })
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  })
})

test.describe.serial('② 회계 판관비 수정·삭제', () => {
  test('수정: 금액 12,345 → 45,000', async ({ page }) => {
    await login(page, ACCT)
    await page.goto('/expenses?q=E2E지출BETA')
    const row = page.locator('tbody tr', { hasText: 'E2E지출BETA' })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: '수정' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('금액 *').fill('45000')
    await dialog.getByRole('button', { name: '저장' }).click()
    await expect(row).toContainText('45,000')
  })

  test('삭제: 목록에서 사라짐', async ({ page }) => {
    await login(page, ACCT)
    await page.goto('/expenses?q=E2E지출BETA')
    const row = page.locator('tbody tr', { hasText: 'E2E지출BETA' })
    await expect(row).toHaveCount(1)
    page.once('dialog', (d) => d.accept())
    await row.getByRole('button', { name: '삭제' }).click()
    await expect(row).toHaveCount(0)
  })
})

test.describe('④ 로그아웃 후 다른 계정 로그인', () => {
  test('메뉴 로그아웃 → 세션 해제 → 다른 계정으로 로그인', async ({ page, context }) => {
    await login(page, ACCT)
    await page.locator('aside button').last().click()
    await page.getByRole('menuitem', { name: '로그아웃' }).click()
    await page.waitForURL((u) => u.pathname === '/login')
    expect((await context.cookies()).some((c) => c.name.includes('session-token'))).toBe(false)
    // 로그인 페이지가 홈으로 튕기지 않아야 함
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible()
    await login(page, ADMIN)
    await expect(page.getByText('사용자·설정')).toBeVisible()
  })
})

test.describe('③ viewer 화면 정리', () => {
  // ① 에서 비밀번호가 바뀌므로 픽스처를 다시 맞춤
  test.beforeAll(() => {
    execSync('npx tsx scripts/e2e-fixture-beta.ts', { stdio: 'inherit' })
  })

  test('입력 버튼 미노출 + 입력 페이지 리다이렉트', async ({ page }) => {
    await login(page, VIEWER)
    await page.goto('/deals')
    await expect(page.getByRole('link', { name: '새 거래' })).toHaveCount(0)
    await page.goto('/deals/new')
    await page.waitForURL((u) => u.pathname === '/deals')

    await page.goto('/counterparties')
    await expect(page.getByRole('link', { name: '새 거래처' })).toHaveCount(0)
    await page.goto('/counterparties/new')
    await page.waitForURL((u) => u.pathname === '/counterparties')

    await page.goto('/expenses')
    await expect(page.getByRole('link', { name: '판관비 입력' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '수정' })).toHaveCount(0)
    await page.goto('/expenses/new')
    await page.waitForURL((u) => u.pathname === '/expenses')
  })

  test('거래처 상세는 읽기전용', async ({ page }) => {
    await login(page, VIEWER)
    await page.goto('/counterparties')
    await page.locator('tbody tr a').first().click()
    await page.waitForURL(/\/counterparties\/[0-9a-f-]+/)
    await expect(page.getByText('조회 전용')).toBeVisible()
    await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '비활성화' })).toHaveCount(0)
  })
})
