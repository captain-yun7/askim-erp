import { test, expect, type Page } from '@playwright/test'

/** router.refresh() 제거 후에도 서버액션의 revalidatePath 만으로 화면이 갱신되는지 확인 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

test('거래처 수정 → 목록으로 돌아오면 바뀐 이름이 보인다', async ({ page }) => {
  await login(page)
  await page.goto('/counterparties')
  await page.waitForSelector('tbody tr')
  const firstLink = page.locator('tbody tr a').first()
  const original = (await firstLink.innerText()).trim()
  const href = await firstLink.getAttribute('href')

  await page.goto(`${href}`)
  const nameInput = page.locator('input').first()
  const renamed = `${original}_QA`
  await nameInput.fill(renamed)
  await page.getByRole('button', { name: /저장/ }).first().click()
  await page.waitForURL('**/counterparties')
  await expect(page.getByText(renamed).first()).toBeVisible({ timeout: 10_000 })

  // 원복
  await page.goto(`${href}`)
  await page.locator('input').first().fill(original)
  await page.getByRole('button', { name: /저장/ }).first().click()
  await page.waitForURL('**/counterparties')
  await expect(page.getByText(renamed)).toHaveCount(0)
})

test('관리자 수정표시기간 저장 → 새로고침해도 유지', async ({ page }) => {
  await login(page)
  await page.goto('/admin')
  const input = page.locator('#highlight-days')
  const original = await input.inputValue()
  const next = original === '14' ? '10' : '14'
  await input.fill(next)
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText(/일로 저장되었습니다/)).toBeVisible({ timeout: 10_000 })
  await page.reload()
  await expect(page.locator('#highlight-days')).toHaveValue(next)

  await page.locator('#highlight-days').fill(original)
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText(/일로 저장되었습니다/)).toBeVisible({ timeout: 10_000 })
})
