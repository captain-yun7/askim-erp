import { test, expect, type Page } from '@playwright/test'

/** 운영 점검 — 화면을 열고 누르기만 한다. 저장·삭제·내보내기 버튼은 누르지 않는다 */
async function login(page: Page) {
  const email = process.env.PROD_QA_EMAIL
  const password = process.env.PROD_QA_PASSWORD
  if (!email || !password) throw new Error('PROD_QA_EMAIL / PROD_QA_PASSWORD 가 없습니다 (_docs/qa-account.env)')
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
async function openDeals(page: Page, query = '') {
  await page.goto(`/deals${query}`)
  await page.locator('[data-bulk-ready]').waitFor({ timeout: 30_000 })
  const btn = page.locator('[data-overdue-dialog]').getByRole('button', { name: '확인' })
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) await btn.click()
}
async function switchTo(page: Page, entity: 'kr' | 'us') {
  await page.getByLabel('법인 선택').selectOption(entity)
  await expect(page.locator('[data-slot=entity-switcher]')).toHaveAttribute('data-entity', entity)
  await page.waitForLoadState('networkidle')
}
const headers = async (page: Page) =>
  (await page.locator('[data-slot=deals-scroll] thead tr').first().locator('th').allInnerTexts()).map((h) => h.replace(/\s+/g, ''))

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('거래 — 요약 카드 5개(인센티브 합계 포함), 목록과 수정 표시', async ({ page }) => {
  await openDeals(page)
  const cards = await page.locator('[data-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')))
  expect(cards).toEqual(['매출 합계', '매입 합계', '손익', '인센티브 합계', '미입금'])
  await expect(page.locator('[data-slot=deals-scroll] tbody tr').first()).toBeVisible()
  // 수정완료는 글씨 없는 상자
  const done = page.locator('[data-review=done]')
  if (await done.count()) await expect(done.first()).toHaveText('')
  // 조회 전용 계정은 표시를 바꿀 수 없다
  await expect(page.locator('[data-review]').first()).toBeDisabled()
})

test('매출목표 — 달성치·수익 근거 합계가 표의 값과 같다', async ({ page }) => {
  await page.goto('/reports/plan')
  const dialog = page.locator('[data-drill-dialog]')
  for (const key of ['plan_sales_all', 'plan_profit_all']) {
    await page.locator(`[data-drill="${key}"]`).click()
    await expect(dialog.locator('[data-slot=drill-check]')).toHaveAttribute('data-ok', 'true')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
})

test('매출장표 — 근거 합계가 표의 값과 같다', async ({ page }) => {
  await page.goto('/reports/ledger')
  await page.locator('tr[data-row="sales_accrual"] [data-drill]').first().click()
  await expect(page.locator('[data-drill-dialog] [data-slot=drill-check]')).toHaveAttribute('data-ok', 'true')
})

test('미국법인 — 부가세·계산서 열 없이 손익(KRW)', async ({ page }) => {
  await page.goto('/')
  await switchTo(page, 'us')
  try {
    await openDeals(page, '?year=all')
    const hs = await headers(page)
    expect(hs).not.toContain('부가세')
    expect(hs.some((h) => h.includes('계산서'))).toBe(false)
    expect(hs).toContain('손익(KRW)')
  } finally {
    await switchTo(page, 'kr')
  }
})

test('권한 — 인사관리·수정요청 집계에 들어갈 수 없다', async ({ page }) => {
  for (const path of ['/hr', '/review-requests']) {
    await page.goto(path)
    await expect(page).not.toHaveURL(new RegExp(path))
  }
})
