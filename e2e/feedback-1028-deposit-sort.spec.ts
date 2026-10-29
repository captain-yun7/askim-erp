import { test, expect, type Page } from '@playwright/test'

/** 2026-10-28·29 요청 — 보증금·전속계약: 전속계약 먼저, 그 다음 보증금, 각각 거래처 가나다순 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}

const ko = new Intl.Collator('ko', { numeric: true })
type Row = { kind: string; name: string }
const readRows = (page: Page) =>
  page.locator('tbody tr[data-kind]').evaluateAll((els) =>
    els.map((e) => ({ kind: e.getAttribute('data-kind')!, name: (e.querySelectorAll('td')[2] as HTMLElement).innerText.trim() })),
  )
const expected = (rows: Row[], dir: 1 | -1) => [
  ...rows.filter((r) => r.kind === 'exclusive').map((r) => r.name).sort((a, b) => ko.compare(a, b) * dir),
  ...rows.filter((r) => r.kind === 'deposit').map((r) => r.name).sort((a, b) => ko.compare(a, b) * dir),
]

test('처음부터 전속계약 가나다순 → 보증금 가나다순, 제목을 누르면 각각 역순', async ({ page }) => {
  await login(page)
  await page.goto('/deposits')
  await page.locator('[data-deposit-ready]').waitFor({ timeout: 30_000 })
  await expect(page.locator('tbody tr[data-kind]').first()).toBeVisible()
  const rows = await readRows(page)
  expect(new Set(rows.map((r) => r.kind)).size).toBe(2)
  // 전속계약이 모두 보증금보다 앞
  const kinds = rows.map((r) => r.kind)
  expect(kinds.lastIndexOf('exclusive')).toBeLessThan(kinds.indexOf('deposit'))
  expect(rows.map((r) => r.name)).toEqual(expected(rows, 1))
  expect((await page.locator('tbody tr[data-kind]').first().locator('td').first().innerText()).trim()).toBe('1')

  const btn = page.locator('[data-slot=deposit-name-sort]')
  await btn.click()
  await expect.poll(async () => (await readRows(page)).map((r) => r.name)).toEqual(expected(rows, -1))
  await btn.click()
  await expect.poll(async () => (await readRows(page)).map((r) => r.name)).toEqual(expected(rows, 1))
})

test('상태를 바꿔도 같은 순서가 유지된다', async ({ page }) => {
  await login(page)
  await page.goto('/deposits')
  await page.locator('[data-deposit-ready]').waitFor({ timeout: 30_000 })
  await expect(page.locator('tbody tr[data-kind]').first()).toBeVisible()
  await page.getByRole('button', { name: '상태 골라 보기' }).click()
  await page.locator('[data-slot=deposit-status-filter]').getByRole('menuitem', { name: '전체 보기' }).click()
  const rows = await readRows(page)
  expect(rows.map((r) => r.name)).toEqual(expected(rows, 1))
})
