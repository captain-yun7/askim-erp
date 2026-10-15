import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-10-15 요청 — 손익 수동 조정, 매출처·매입처 없음이면 그 쪽 필수 항목 생략 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
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
const field = (page: Page, label: string) => page.locator(`div:has(> label:text-is("${label}")) input`).first()
async function pickSelect(page: Page, label: string) {
  const trigger = page.locator(`div:has(> label:text-is("${label}")) [role=combobox]`).first()
  if ((await trigger.innerText()).trim()) return
  await trigger.click()
  const listbox = page.getByRole('listbox')
  const preferred = listbox.getByRole('option', { name: /관리자/ })
  await listbox.getByRole('option').first().waitFor()
  await (label === '담당자' && (await preferred.count()) ? preferred.first() : listbox.getByRole('option').first()).click()
  await listbox.waitFor({ state: 'hidden' }).catch(() => {})
}
async function openDeal(page: Page, code: string) {
  await page.goto(`/deals?fCode=${code}&year=all`)
  await ready(page)
  await rowOf(page, code).locator('td:first-child a').click()
  await page.waitForURL((u) => /^\/deals\/[0-9a-f-]{36}$/.test(u.pathname))
}

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('조정 손익을 넣으면 손익·성과급이 그 값으로, 비우면 자동 계산으로 돌아온다', async ({ page }) => {
  await login(page)
  await openDeal(page, 'E2E0916-MEMBER')
  await page.getByLabel('조정 손익', { exact: true }).fill('1500000')
  await page.getByLabel('손익 조정 사유').fill('E2E 별도 비용 반영')
  await expect(page.getByText('(자동 계산 1,000,000)')).toBeVisible()
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  await page.goto('/deals?fCode=E2E0916-MEMBER&year=all')
  await ready(page)
  const row = rowOf(page, 'E2E0916-MEMBER')
  const profit = row.locator('[data-adjusted]')
  await expect(profit).toContainText('조정')
  await expect(profit).toContainText('1,500,000')
  await expect(profit).toHaveAttribute('title', /자동 계산 1,000,000.*E2E 별도 비용 반영/)
  // 성과급 = 조정 손익 × 기본 5%
  await expect(row.locator('[data-col=incentiveAmount]')).toHaveText('75,000')

  await openDeal(page, 'E2E0916-MEMBER')
  await expect(page.getByLabel('조정 손익', { exact: true })).toHaveValue('1,500,000')
  await page.getByLabel('조정 손익', { exact: true }).fill('')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')
  await page.goto('/deals?fCode=E2E0916-MEMBER&year=all')
  await ready(page)
  await expect(row.locator('[data-adjusted]')).toHaveCount(0)
  await expect(row.locator('[data-col=incentiveAmount]')).toHaveText('50,000')
})

test('매출처 없음을 고르면 입금예정일 등 매출 쪽 필수 항목 없이 저장된다', async ({ page }) => {
  await login(page)
  await page.goto('/deals/new')
  await field(page, '거래코드').fill('E2E1015-NONE')
  await pickSelect(page, '담당자')
  await pickSelect(page, '상품구분')
  await pickSelect(page, '계정항목')
  const issuer = page.locator('div:has(> label:text-is("발행처"))').first()
  await issuer.locator('input').fill('매출처 없음')
  await issuer.locator('.max-h-64 button', { hasText: '(매출처 없음)' }).click()
  await field(page, '품목명').fill('E2E거래1015-없음')
  await page.locator('div:has(> label:has-text("매출금")) input').first().fill('500000')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  // 실제 매출처면 여전히 입금예정일 등을 요구한다
  await page.goto('/deals/new')
  await field(page, '거래코드').fill('E2E1015-REAL')
  await issuer.locator('input').fill('주')
  await issuer.locator('.max-h-64 button').first().click()
  await page.getByRole('button', { name: '확정저장' }).click()
  await expect(page.getByText(/필수 항목이 비어 있습니다:.*입금예정일/)).toBeVisible()
})
