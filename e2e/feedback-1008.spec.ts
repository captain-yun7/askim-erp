import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'

/** 2026-10-08 요청사항 10건 중 화면 기능 9건 (법인 선택 제외) */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const PDF = path.join(process.cwd(), 'e2e/fixtures/sample.pdf')

async function login(page: Page, who = ADMIN) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const rowOf = (page: Page, code: string) => page.locator('[data-slot=deals-scroll] tbody tr', { has: page.locator('td:first-child a', { hasText: new RegExp(`^${code}$`) }) })
/** 입금예정월 안내 창이 떠 있으면 닫는다 */
const dismissOverdue = async (page: Page) => {
  // 안내 창은 화면이 준비된(수화) 뒤에 뜬다 — 준비를 기다린 뒤 창이 있으면 닫는다
  await page.locator('[data-bulk-ready]').waitFor({ timeout: 30_000 }).catch(() => {})
  const btn = page.locator('[data-overdue-dialog]').getByRole('button', { name: '확인' })
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click()
    await page.locator('[data-overdue-dialog]').waitFor({ state: 'detached' })
  }
}
const saved = (page: Page) => page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/deals')

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
  execSync('npx tsx scripts/e2e-fixture-1008.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('① 리포트 근거 내역 창에서 엑셀을 내려받는다', async ({ page }) => {
  await login(page)
  await page.goto('/reports/ledger?year=2026&half=h2')
  await page.locator('tr[data-row="sales_accrual"] [data-drill]').first().click()
  const dialog = page.locator('[data-drill-dialog]')
  await expect(dialog.locator('[data-slot=drill-check]')).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '엑셀' }).click()])
  expect(download.suggestedFilename()).toMatch(/^근거내역_.*\.xlsx$/)
})

test('② 매체사 옆 계좌정보 아이콘 · 내보내기에 계좌정보 포함', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916-MEMBER')
  await dismissOverdue(page)
  const row = rowOf(page, 'E2E0916-MEMBER')
  await expect(page.locator('[data-slot=bank-info]')).toHaveCount(0)
  await row.getByLabel('E2E거래처0916-A 계좌정보').click()
  await expect(page.locator('[data-slot=bank-info]')).toContainText('E2E은행')
  await expect(page.locator('[data-slot=bank-info]')).toContainText('123-456-789')
  await expect(page.locator('[data-slot=bank-info]')).toContainText('E2E예금주')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV 내보내기/ }).click()])
  const text = (await (await download.createReadStream()).toArray()).join('')
  expect(text).toContain('매체사 계좌번호')
  expect(text).toContain('123-456-789')
})

test('③ 금액 칸을 공백 / 입력됨으로 거른다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?year=2026')
  await dismissOverdue(page)
  await page.getByLabel('fSales 공백 여부').selectOption('-')
  await page.waitForURL((u) => u.searchParams.get('fSales') === '-')
  const empty = await page.locator('[data-slot=deals-scroll] tbody tr td:nth-child(9)').allInnerTexts()
  expect(empty.length).toBeGreaterThan(0)
  for (const t of empty) expect(t.replace(/\s/g, '')).toMatch(/^-$|^$/)
  await dismissOverdue(page)
  await page.getByLabel('fSales 공백 여부').selectOption('+')
  await page.waitForURL((u) => u.searchParams.get('fSales') === '+')
  const filled = await page.locator('[data-slot=deals-scroll] tbody tr td:nth-child(9)').allInnerTexts()
  expect(filled.length).toBeGreaterThan(0)
  for (const t of filled) expect(t).toMatch(/\d/)
})

test('④ 거래처에 첨부파일을 올리고 목록 왼쪽 아이콘으로 연다', async ({ page }) => {
  await login(page)
  await page.goto('/counterparties?q=E2E거래처0916-A')
  await page.locator('tbody tr a', { hasText: 'E2E거래처0916-A' }).click()
  await page.waitForURL((u) => /^\/counterparties\/.+/.test(u.pathname))
  const box = page.locator('[data-slot=cp-attachments]')
  await box.getByRole('button', { name: /첨부파일/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type=file]').setInputFiles(PDF)
  await expect(dialog.getByText('sample.pdf')).toBeVisible()
  await dialog.getByRole('button', { name: '닫기' }).click()

  await page.goto('/counterparties?q=E2E거래처0916-A')
  const row = page.locator('tbody tr', { hasText: 'E2E거래처0916-A' })
  await expect(row.locator('td').nth(1).getByRole('button', { name: /첨부파일/ })).toContainText('1')
  await row.locator('td').nth(1).getByRole('button', { name: /첨부파일/ }).click()
  await expect(page.getByRole('dialog').getByText('sample.pdf')).toBeVisible()
})

test('⑥ 입금예정월이 지난 미입금 거래는 창과 띠로 안내한다', async ({ page }) => {
  await login(page)
  await page.goto('/deals')
  await page.locator('[data-bulk-ready]').waitFor({ timeout: 30_000 })
  await expect(page.locator('[data-slot=overdue-banner]')).toContainText('귀속월과 입금예정월을 바꿔 주세요')
  await page.locator('[data-slot=overdue-banner]').getByRole('button', { name: '목록 보기' }).click()
  const dialog = page.locator('[data-overdue-dialog]')
  await expect(dialog).toContainText('귀속월과 입금예정월을 바꿔 주세요')
  await expect(dialog.locator('[data-slot=overdue-list]')).toContainText('E2E0916-LEAD')
  await dialog.getByRole('button', { name: '확인' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-slot=overdue-banner]')).toContainText('미입금 거래')
  // 다시 들어와도 띠는 그대로
  await page.goto('/deals?fCode=E2E0916')
  await expect(page.locator('[data-slot=overdue-banner]')).toBeVisible()
})

test('⑦ 수정 모아보기 — 최근에 바뀐 거래만', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916')
  await dismissOverdue(page)
  const row = rowOf(page, 'E2E0916-MEMBER')
  await row.locator('td:nth-child(9) button').click()
  await row.locator('td:nth-child(9) input').fill('1500000')
  await Promise.all([saved(page), row.locator('td:nth-child(9) input').press('Enter')])
  await page.getByRole('button', { name: '수정 모아보기' }).click()
  await page.waitForURL((u) => u.searchParams.get('changed') === '1')
  await expect(rowOf(page, 'E2E0916-MEMBER')).toHaveCount(1)
  const codes = await page.locator('[data-slot=deals-scroll] tbody tr td:first-child a').allInnerTexts()
  expect(codes).not.toContain('E2ESORT-1')
  for (const tr of await page.locator('[data-slot=deals-scroll] tbody tr').all()) expect(await tr.locator('[data-changed]').count()).toBeGreaterThan(0)
})

test('⑧ 수정요청 → 수정완료 → 지움 순환, 표시별 모아보기', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916')
  await dismissOverdue(page)
  const mark = rowOf(page, 'E2E0916-LEAD').locator('[data-review]')
  await expect(mark).toHaveAttribute('data-review', 'none')
  await mark.click()
  await expect(mark).toHaveText('수정요청')
  await page.waitForLoadState('networkidle')
  await page.reload()
  await dismissOverdue(page)
  await expect(rowOf(page, 'E2E0916-LEAD').locator('[data-review]')).toHaveText('수정요청')

  await page.getByRole('button', { name: /수정 표시/ }).click()
  await page.getByRole('checkbox', { name: '수정요청' }).click()
  await page.waitForURL((u) => u.searchParams.get('review') === 'requested')
  const codes = await page.locator('[data-slot=deals-scroll] tbody tr td:first-child a').allInnerTexts()
  expect(codes).toEqual(['E2E0916-LEAD'])

  // 표시 필터를 걸어 둔 채로 바꾸면 행이 목록에서 사라지므로 필터를 풀고 이어서
  await page.goto('/deals?fCode=E2E0916')
  await dismissOverdue(page)
  const m2 = rowOf(page, 'E2E0916-LEAD').locator('[data-review]')
  await m2.click()
  await expect(m2).toHaveText('수정완료')
  await page.waitForLoadState('networkidle')
  await m2.click()
  await expect(m2).toHaveAttribute('data-review', 'none')
  await page.waitForLoadState('networkidle')
  await page.reload()
  await dismissOverdue(page)
  await expect(rowOf(page, 'E2E0916-LEAD').locator('[data-review]')).toHaveAttribute('data-review', 'none')
})

test('⑨ 계정항목에 실측비 · ⑩ 새로고침하면 필터가 지워진다', async ({ page }) => {
  await login(page)
  await page.goto('/deals/new')
  await page.locator('div:has(> label:text-is("계정항목")) [role=combobox]').click()
  await expect(page.getByRole('listbox').getByRole('option', { name: '실측비' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/deals?fCode=E2E0916&year=2026')
  await dismissOverdue(page)
  await page.reload()
  await page.waitForURL((u) => u.pathname === '/deals' && u.search === '')
  await expect(page.getByLabel('fCode 검색')).toHaveValue('')
})
