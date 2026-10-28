import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026.10.14 요청사항 — 결산연월일 · 거래처 전체 · 보증금 상태 필터 · 월별 손익 통장 기준 */
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
const saved = (page: Page) => page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/deals')
const won = (t: string) => Number(t.replace(/[^\d-]/g, ''))

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('결산연월일 — 목록에서 2026-10-30 으로 고치면 날짜까지 보이고, 없는 날짜는 막는다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916-LEAD')
  await expect(page.locator('thead')).toContainText('결산연월일')
  const cell = () => rowOf(page, 'E2E0916-LEAD').locator('td:nth-child(20)')
  await cell().getByTitle('클릭해서 결산연월일 수정').click()
  await cell().getByLabel('결산연월일 입력').fill('2026-10-30')
  await Promise.all([saved(page), cell().getByLabel('결산연월일 입력').press('Enter')])
  await page.reload()
  await expect(cell()).toContainText('2026-10-30')

  await cell().getByTitle('클릭해서 결산연월일 수정').click()
  await cell().getByLabel('결산연월일 입력').fill('2026-02-30')
  await cell().getByLabel('결산연월일 입력').press('Enter')
  await expect(page.getByText('결산연월일은 2026-10-30 처럼 입력해 주세요')).toBeVisible()
  await expect(cell()).toContainText('2026-10-30')

  // 거래 화면에도 결산일
  await rowOf(page, 'E2E0916-LEAD').locator('td:first-child a').click()
  await expect(page.getByLabel('결산일', { exact: true })).toHaveValue('30')
})

test('거래처 — 200건 제한 없이 전체가 보인다', async ({ page }) => {
  await login(page)
  await page.goto('/counterparties')
  await expect(page.getByText('앞 200건만 표시')).toHaveCount(0)
  const total = won(await page.locator('text=총').locator('xpath=..').locator('b').first().innerText())
  await expect(page.locator('tbody tr')).toHaveCount(total)
})

test('보증금 — 상태 필터로 골라 보기', async ({ page }) => {
  // 2026-10-23: 칩 대신 상태 칸 머리를 눌러 고른다 (자세한 건 feedback-1023)
  await login(page)
  await page.goto('/deposits')
  const rows = page.locator('tbody tr[data-kind]')
  await page.getByRole('button', { name: '상태 골라 보기' }).click()
  const menu = page.locator('[data-slot=deposit-status-filter]')
  const held = won(await menu.getByRole('menuitemcheckbox', { name: /^보유/ }).innerText())
  await menu.getByRole('menuitem', { name: '전체 보기' }).click()
  const all = await rows.count()
  await page.getByRole('button', { name: '상태 골라 보기' }).click()
  for (const label of ['계약중', '반환완료', '계약종료']) await menu.getByRole('menuitemcheckbox', { name: new RegExp(`^${label}`) }).click()
  await expect(rows).toHaveCount(held)
  for (const s of await rows.locator('td[data-col=status]').allInnerTexts()) expect(s.trim()).toBe('보유')
  await menu.getByRole('menuitem', { name: '전체 보기' }).click()
  await expect(rows).toHaveCount(all)
})

test('월별 손익 — 매출총이익이 매출장표 손익(통장)과 같다', async ({ page }) => {
  await login(page)
  await page.goto('/reports/ledger?year=2026&half=h1')
  const ledgerRow = page.locator('tbody tr', { has: page.locator('td:first-child', { hasText: /^손익\(통장\)$/ }) })
  const jan = won((await ledgerRow.locator('td').nth(1).innerText()).split('\n')[0])
  await page.goto('/reports/pnl?year=2026')
  await expect(page.getByText('통장 입금 기준 손익')).toBeVisible()
  const pnlJan = won(await page.locator('tbody tr').first().locator('td').nth(1).innerText())
  expect(pnlJan).toBe(jan)
})

test('계정항목 성과금 — 매출·매입 없이 성과금만 넣으면 그 금액이 성과급', async ({ page }) => {
  await login(page)
  await page.goto('/deals/new')
  await page.locator('div:has(> label:text-is("거래코드")) input').first().fill('E2E1019-INC')
  for (const label of ['담당자', '상품구분']) {
    await page.locator(`div:has(> label:text-is("${label}")) [role=combobox]`).first().click()
    const listbox = page.getByRole('listbox')
    await listbox.getByRole('option').first().click()
    await listbox.waitFor({ state: 'hidden' }).catch(() => {})
  }
  await page.locator('div:has(> label:text-is("계정항목")) [role=combobox]').click()
  await page.getByRole('listbox').getByRole('option', { name: '성과금' }).click()
  await page.locator('div:has(> label:text-is("품목명")) input').first().fill('E2E거래1019-성과금')
  // 성과금 칸이 없으면 저장이 막힌다
  await page.getByRole('button', { name: '확정저장' }).click()
  await expect(page.getByText(/필수 항목이 비어 있습니다: 성과금 또는 조정 손익/)).toBeVisible()
  await page.getByLabel('성과금', { exact: true }).fill('-105000')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  await page.goto('/deals?fCode=E2E1019-INC&year=all')
  const cell = rowOf(page, 'E2E1019-INC').locator('[data-col=incentiveAmount]')
  await expect(cell).toHaveText('-105,000')
})
