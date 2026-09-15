import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 감사 로그 (2026-09-15) — 로그인·거래 등록·인라인 수정·로그아웃·로그인 실패가 관리자 화면에 남는다 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const ITEM = `E2E거래감사${Date.now()}`

async function login(page: Page, who = ADMIN) {
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('행위가 감사 로그에 순서대로 기록되고 필터가 동작한다', async ({ page }) => {
  // 로그인 실패 1회
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', 'wrong-password')
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL(/\/login/)

  await login(page)
  await page.goto('/deals/new')
  await page.locator('div:has(> label:text-is("품목명")) input').fill(ITEM)
  await page.locator('div:has(> label:has-text("매출금")) input').first().fill('1000000')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  await page.goto(`/deals?q=${encodeURIComponent(ITEM)}`)
  const row = page.locator('tbody tr').first()
  await row.locator('td:nth-child(9) button').click()
  await row.locator('td:nth-child(9) input').fill('2000000')
  await row.locator('td:nth-child(9) input').press('Enter')
  await expect(row.locator('td:nth-child(9)')).toHaveText(/2,000,000/)

  await page.goto('/admin/audit')
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toContainText('거래 인라인 수정')
  await expect(rows.first()).toContainText('매출금')
  await expect(rows.nth(1)).toContainText('거래 등록')
  await expect(rows.nth(2)).toContainText('로그인')
  await expect(rows.nth(2)).toContainText('관리자')
  await expect(rows.nth(3)).toContainText('로그인 실패')
  await expect(rows.nth(3)).toContainText(ADMIN.email)

  // 상세 펼치기 — 변경 전/후
  await rows.first().getByText('상세').click()
  await expect(rows.first()).toContainText('1000000')
  await expect(rows.first()).toContainText('2000000')

  // 행위 필터
  await page.getByLabel('행위').selectOption('deal.create')
  await page.waitForURL((u) => u.searchParams.get('action') === 'deal.create')
  await expect(page.locator('tbody tr').first()).toContainText('거래 등록')
  const texts = await page.locator('tbody tr').allInnerTexts()
  expect(texts.every((t) => t.includes('거래 등록'))).toBe(true)

  // 로그아웃 기록
  await page.locator('aside button').last().click()
  await page.getByRole('menuitem', { name: '로그아웃' }).click()
  await page.waitForURL((u) => u.pathname === '/login')
  await login(page)
  await page.goto('/admin/audit?action=auth.logout')
  await expect(page.locator('tbody tr').first()).toContainText('로그아웃')
})

test('관리자가 아니면 감사 로그에 접근할 수 없다', async ({ page }) => {
  await login(page, { email: 'accountant@askim.local', password: 'askim2026!' })
  await page.goto('/admin/audit')
  await page.waitForURL('http://localhost:3300/')
})
