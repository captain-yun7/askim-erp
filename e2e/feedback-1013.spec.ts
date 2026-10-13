import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-10-13 요청사항 — 인센티브 합계 카드, 수정완료 체크 상자·요청취소, 매출목표 달성치·수익 근거 보기 */
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
  execSync('npx tsx scripts/e2e-fixture-1012.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('인센티브 합계 카드가 손익과 미입금 사이에 있고, 목록 성과급 합계와 같다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  const cards = await page.locator('[data-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')))
  expect(cards).toEqual(['매출 합계', '매입 합계', '손익', '인센티브 합계', '미입금'])

  await page.goto('/deals')
  await switchTo(page, 'us')
  await page.goto('/deals?fCode=E2EUS-FX&year=all')
  await ready(page)
  // 손익 400 × 환율 1300 = 520,000 × 5%
  await expect(page.locator('[data-card="인센티브 합계"]')).toContainText('₩ 26,000')
  await switchTo(page, 'kr')
})

test('수정완료는 글씨 없는 초록 체크 상자(빈 상자와 같은 폭), 관리자 메뉴에 요청취소', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  const mark = rowOf(page, 'E2E0916-MEMBER').locator('[data-review]')
  const emptyBox = await mark.boundingBox()
  const menu = rowOf(page, 'E2E0916-MEMBER').locator('[data-slot=review-menu]')
  await mark.click()
  await menu.getByRole('menuitem', { name: '수정완료 표시' }).click()
  await expect(mark).toHaveAttribute('data-review', 'done')
  await expect(mark).toHaveText('')
  await expect(mark).toHaveAccessibleName('수정완료')
  const doneBox = await mark.boundingBox()
  expect(Math.round(doneBox!.width)).toBe(Math.round(emptyBox!.width))
  await page.waitForLoadState('networkidle')

  await mark.click()
  await expect(menu.getByRole('menuitem')).toHaveText(['수정요청 표시', '요청취소'])
  await menu.getByRole('menuitem', { name: '요청취소' }).click()
  await expect(mark).toHaveAttribute('data-review', 'none')
  await page.waitForLoadState('networkidle')
})

test('매출목표 표의 달성치·수익을 누르면 근거 거래가 뜨고 합계가 표의 값과 같다', async ({ page }) => {
  await login(page)
  await page.goto('/reports/plan')
  const buttons = page.locator('[data-drill^="plan_"]')
  await expect(buttons.first()).toBeVisible()
  const dialog = page.locator('[data-drill-dialog]')
  for (const key of ['plan_sales_all', 'plan_profit_all']) {
    await page.locator(`[data-drill="${key}"]`).click()
    await expect(dialog.locator('[data-slot=drill-check]')).toHaveAttribute('data-ok', 'true')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
  // 목표군 한 칸: 근거 표 열 이름이 매출금·손익
  await buttons.first().click()
  await expect(dialog.locator('[data-slot=drill-check]')).toHaveAttribute('data-ok', 'true')
  await expect(dialog.locator('thead')).toContainText('상품구분')
})
