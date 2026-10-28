import { test, expect, type Page } from '@playwright/test'

/** 2026-10-28 요청 — 보증금·전속계약 거래처 이름 오름차순으로 보기 */
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

test('거래처(매체명) 제목을 누르면 가나다순 → 역순 → 원래 순서', async ({ page }) => {
  await login(page)
  await page.goto('/deposits')
  const rows = page.locator('tbody tr[data-kind]')
  await expect(rows.first()).toBeVisible()
  const names = async () => (await rows.locator('td:nth-child(3)').allInnerTexts()).map((t) => t.trim())
  const original = await names()
  expect(original.length).toBeGreaterThan(3)
  const asc = [...original].sort(ko.compare)
  expect(original).not.toEqual(asc) // 원래 순서는 가나다순이 아니어야 검증이 의미 있다

  const sortBtn = page.locator('[data-slot=deposit-name-sort]')
  await sortBtn.click()
  await expect.poll(names).toEqual(asc)
  // 보증금·전속계약이 섞여서 정렬된다
  const kinds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))
  expect(new Set(kinds).size).toBe(2)
  // No. 는 1부터 다시
  expect((await rows.first().locator('td').first().innerText()).trim()).toBe('1')

  await sortBtn.click()
  await expect.poll(names).toEqual([...asc].reverse())

  await sortBtn.click()
  await expect.poll(names).toEqual(original)
})

test('정렬한 채로 상태를 바꿔도 가나다순이 유지된다', async ({ page }) => {
  await login(page)
  await page.goto('/deposits')
  const rows = page.locator('tbody tr[data-kind]')
  await expect(rows.first()).toBeVisible()
  await page.locator('[data-slot=deposit-name-sort]').click()
  await page.getByRole('button', { name: '상태 골라 보기' }).click()
  const menu = page.locator('[data-slot=deposit-status-filter]')
  await menu.getByRole('menuitem', { name: '전체 보기' }).click()
  const names = (await rows.locator('td:nth-child(3)').allInnerTexts()).map((t) => t.trim())
  expect(names).toEqual([...names].sort(ko.compare))
})
