import { test, expect, type Page } from '@playwright/test'

/** 2026-10-28 요청 — 거래처 선택 줄(구분 지정·선택 삭제)이 스크롤해도 화면 위에 붙어 있게 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}

test('거래처 — 맨 아래로 내려도 선택 줄이 화면 위에 보이고, 아래에서 고른 것까지 셈하고 바로 누를 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto('/counterparties')
  const boxes = page.locator('tbody tr').getByRole('checkbox')
  expect(await boxes.count()).toBeGreaterThan(30)
  await boxes.first().click()
  const bar = page.locator('[data-slot=bulk-bar]')
  await expect(bar).toContainText('1건 선택')

  // 한참 아래 행을 골라도 줄이 화면 맨 위에 붙어 있다
  const far = boxes.nth(Math.min(60, (await boxes.count()) - 1))
  await far.scrollIntoViewIfNeeded()
  await page.mouse.wheel(0, 400)
  await far.click()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(800)
  await expect(bar).toContainText('2건 선택')
  await expect(bar).toBeInViewport()
  const box = (await bar.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeLessThan(5)
  // 줄이 표를 가리지 않고 맨 위에 그려진다 (그 자리를 눌렀을 때 줄 안의 요소가 잡힌다)
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-slot=bulk-bar]') != null, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  expect(hit).toBe(true)
  await expect(bar.getByRole('button', { name: '선택 삭제' })).toBeVisible()
  await expect(bar.getByLabel('구분 일괄 지정')).toBeVisible()

  // 아래에 있는 채로 선택 해제를 누를 수 있다
  await bar.getByRole('button', { name: '선택 해제' }).click()
  await expect(bar).toHaveCount(0)
})
