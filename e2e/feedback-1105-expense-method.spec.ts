import { expect, test } from '@playwright/test'

/** 2026-11-05 요청: 판관비 목록에서 수단 칸 삭제 (입력·수정 화면과 저장 값은 그대로) */
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('#email', 'admin@askim.local')
  await page.fill('#password', 'askim2026!')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('/')
}

test('판관비 목록에 수단 칸·결제수단 필터가 없다', async ({ page }) => {
  await login(page)
  await page.goto('/expenses?year=2026')
  const heads = (await page.locator('#expenses-table thead th').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
  expect(heads).toEqual(['지출일', '품목', '거래처', '항목', '금액'])
  const first = page.locator('#expenses-table tbody tr').first()
  await expect(first).not.toContainText('법인카드')
  await expect(page.getByText('결제수단', { exact: true })).toHaveCount(0)
  // 칸 수가 제목 수와 맞다 (선택 칸·수정 버튼 칸 포함)
  expect(await first.locator('td').count()).toBe(await page.locator('#expenses-table thead th').count())
})

test('수정 창에는 수단이 그대로 있다', async ({ page }) => {
  await login(page)
  await page.goto('/expenses?year=2026')
  await page.locator('#expenses-table tbody tr').first().getByRole('button', { name: /수정/ }).click()
  await expect(page.getByLabel('수단')).toBeVisible()
})
