import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-09-17 고객 수정 요청 (명철 외) 9건 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const SALES = { email: 'sales17.e2e@askim.local', password: PW }

async function login(page: Page, who: { email: string; password: string }) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const rowOf = (page: Page, code: string) => page.locator('[data-slot=deals-scroll] tbody tr', { has: page.locator('td:first-child a', { hasText: new RegExp(`^${code}$`) }) })
const field = (page: Page, label: string) => page.locator(`div:has(> label:text-is("${label}")) input`).first()

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0917.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('① 거래 — 체크박스로 고른 거래의 계산서 발행일을 한 번에 수정', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fCode=E2E0917')
  await expect(page.locator('[data-slot=deals-bulk-bar]')).toHaveCount(0)
  await page.getByLabel('E2E0917-A 선택').check()
  await page.getByLabel('E2E0917-B 선택').check()
  const bar = page.locator('[data-slot=deals-bulk-bar]')
  await expect(bar).toContainText('2건 선택')
  await bar.getByLabel('일괄 발행일').fill('260917')
  await bar.getByRole('button', { name: '2건에 적용' }).click()
  await expect(page.getByText('매출계산서 발행일을 2건에')).toBeVisible()
  await expect(rowOf(page, 'E2E0917-A').locator('td:nth-child(17)')).toContainText('2026-09-17')
  await expect(rowOf(page, 'E2E0917-B').locator('td:nth-child(17)')).toContainText('2026-09-17')
  await expect(rowOf(page, 'E2E0917-C').locator('td:nth-child(17)')).not.toContainText('2026-09-17')
  await expect(bar).toHaveCount(0) // 적용 후 선택 해제

  // 매입계산서 · 전체 선택
  await page.getByLabel('전체 선택').check()
  await expect(bar).toContainText('4건 선택')
  await bar.getByLabel('계산서 구분').selectOption('purchase')
  await bar.getByLabel('일괄 발행일').fill('2026-09-30')
  await bar.getByRole('button', { name: '4건에 적용' }).click()
  await expect(page.getByText('매입계산서 발행일을 4건에')).toBeVisible()
  for (const c of ['A', 'B', 'C', 'ADMIN']) await expect(rowOf(page, `E2E0917-${c}`).locator('td:nth-child(18)')).toContainText('2026-09-30')
})

test('② 판관비 — 입력 화면 지출수단에서 개인카드·현금 제외, 목록 여러 건 삭제', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/expenses/new')
  await page.locator('div:has(> label:text-is("지출수단")) button').first().click()
  await expect(page.getByRole('option', { name: '법인카드' })).toBeVisible()
  await expect(page.getByRole('option', { name: '이체' })).toBeVisible()
  await expect(page.getByRole('option', { name: '개인카드' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: '현금' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.goto('/expenses?q=E2E지출0917')
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.locator('tbody tr', { hasText: 'E2E지출0917-1' }).locator('input[data-row-select]').check()
  await page.locator('tbody tr', { hasText: 'E2E지출0917-2' }).locator('input[data-row-select]').check()
  let dialogs = 0
  page.on('dialog', (d) => {
    dialogs++
    expect(d.message()).toContain('판관비 2건')
    d.accept()
  })
  await page.locator('[data-slot=expenses-bulk-bar]').getByRole('button', { name: '선택 삭제' }).click()
  await expect(page.getByText('판관비 2건을 삭제했습니다')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  expect(dialogs).toBe(1)
})

test('③ 거래 목록 — 부가세 포함 총매출·총매입 컬럼', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fCode=E2E0917-A')
  const heads = await page.locator('[data-slot=deals-scroll] thead tr').first().locator('th').allInnerTexts()
  expect(heads.map((h) => h.replace(/\s+/g, ''))).toEqual(expect.arrayContaining(['총매출(VAT포함)', '총매입(VAT포함)']))
  const row = rowOf(page, 'E2E0917-A')
  await expect(row.locator('td[data-col=salesGross]')).toHaveText('1,100,000')
  await expect(row.locator('td[data-col=purchaseGross]')).toHaveText('770,000')
  // 금액을 고치면 총액도 따라감
  await row.locator('td:nth-child(9) button').click()
  await row.locator('td:nth-child(9) input').fill('2000000')
  await row.locator('td:nth-child(9) input').press('Enter')
  await expect(row.locator('td[data-col=salesGross]')).toHaveText('2,200,000')
  // 총매출 검색
  await page.goto('/deals?fCode=E2E0917&fSalesGross=2200000')
  await expect(page.locator('[data-slot=deals-scroll] tbody tr')).toHaveCount(1)
})

test('④⑤⑦ 거래 입력 — 금액 쉼표, 숫자만 쳐도 되는 날짜, 거래코드 필수', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals/new')
  // ⑦ 코드 없이 저장 불가
  await field(page, '품목명').fill('E2E거래0917-입력')
  await page.getByRole('button', { name: '확정저장' }).click()
  await expect(page.getByText('거래코드를 입력하세요')).toBeVisible()
  await expect(page).toHaveURL(/\/deals\/new/)
  await expect(field(page, '거래코드')).toHaveAttribute('placeholder', /예\)/)

  // ④ 천 단위 쉼표 + 부가세·총액 자동
  const sales = page.locator('div:has(> label:has-text("매출금")) input').first()
  await sales.pressSequentially('10000000')
  await expect(sales).toHaveValue('10,000,000')
  await expect(page.locator('div:has(> label:text-is("총매출")) input')).toHaveValue('11,000,000')
  // 중간을 고쳐도 커서가 튀지 않음: 1|0,000,000 자리에 2 입력 → 120,000,000
  await sales.focus()
  await sales.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1)) // macOS 는 Home 키가 입력칸에서 동작하지 않음
  await page.keyboard.type('2')
  await expect(sales).toHaveValue('120,000,000')
  await page.keyboard.type('3')
  await expect(sales).toHaveValue('1,230,000,000')

  // ⑤ 260917 → 2026-09-17
  const due = page.getByLabel('salesDueDate')
  await due.fill('260917')
  await due.press('Tab')
  await expect(due).toHaveValue('2026-09-17')
  const paid = page.getByLabel('salesPaidDate')
  await paid.fill('20260930')
  await paid.press('Enter')
  await expect(paid).toHaveValue('2026-09-30')
  const bad = page.getByLabel('adStart')
  await bad.fill('261340')
  await bad.press('Tab')
  await expect(page.getByText('날짜를 알 수 없습니다')).toBeVisible()
  await expect(bad).toHaveValue('')

  await field(page, '거래코드').fill('E2E0917-NEW')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  // 저장값 확인 — 수정 화면도 쉼표 표시(소수 .00 없음), 날짜 유지
  await page.goto('/deals?fCode=E2E0917-NEW')
  await rowOf(page, 'E2E0917-NEW').locator('td:first-child a').click()
  await expect(page.locator('div:has(> label:has-text("매출금")) input').first()).toHaveValue('1,230,000,000')
  await expect(page.getByLabel('salesDueDate')).toHaveValue('2026-09-17')
  await expect(page.getByLabel('salesPaidDate')).toHaveValue('2026-09-30')

  // 빠른 행 추가도 코드 필수
  await page.goto('/deals')
  await page.getByRole('button', { name: /행 추가/ }).click()
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByText('거래코드를 입력해 주세요')).toBeVisible()
})

test('⑤-2 목록 인라인 날짜도 숫자만으로 입력', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fCode=E2E0917-C')
  const cell = rowOf(page, 'E2E0917-C').locator('td:nth-child(19)')
  await cell.locator('button').first().click()
  await cell.getByLabel('salesDueDate 입력').fill('261005')
  await cell.getByLabel('salesDueDate 입력').press('Enter')
  await expect(cell).toContainText('2026-10-05')
  await page.reload()
  await expect(rowOf(page, 'E2E0917-C').locator('td:nth-child(19)')).toContainText('2026-10-05')
})

test('⑥ 거래 삭제 — 영업 계정이 확정 저장한 본인 거래도 삭제, 목록에서 여러 건은 확인 한 번', async ({ page }) => {
  await login(page, SALES)
  await page.goto('/deals?fCode=E2E0917')
  await expect(page.locator('[data-slot=deals-scroll] tbody tr')).toHaveCount(3) // 본인 거래만
  // 상세 화면에 삭제 버튼 (이전에는 초안만 보였음)
  await rowOf(page, 'E2E0917-C').locator('td:first-child a').click()
  await expect(page.getByRole('button', { name: '삭제', exact: true })).toBeVisible()
  await page.goBack()

  await page.getByLabel('E2E0917-A 선택').check()
  await page.getByLabel('E2E0917-B 선택').check()
  let dialogs = 0
  page.on('dialog', (d) => {
    dialogs++
    expect(d.message()).toContain('거래 2건')
    d.accept()
  })
  await page.locator('[data-slot=deals-bulk-bar]').getByRole('button', { name: '선택 삭제' }).click()
  await expect(page.getByText('거래 2건을 삭제했습니다')).toBeVisible()
  await expect(page.locator('[data-slot=deals-scroll] tbody tr')).toHaveCount(1)
  expect(dialogs).toBe(1)
})

test('⑧ 비고 — 매출금·매입금에 마우스를 올리면 비고가 보인다', async ({ page }) => {
  await login(page, ADMIN)
  // ⑥ 에서 A 가 삭제되므로 비고가 있는 거래를 다시 준비
  execSync('npx tsx scripts/e2e-fixture-0917.ts', { stdio: 'inherit' })
  await page.goto('/deals?fCode=E2E0917-A')
  const row = rowOf(page, 'E2E0917-A')
  await expect(row.locator('td:nth-child(9) [data-memo]')).toHaveAttribute('title', /매출 비고: 매출쪽 메모 A/)
  await expect(row.locator('td:nth-child(12) [data-memo]')).toHaveAttribute('title', /매입 비고: 매입쪽 메모 A/)
  // 비고가 없는 거래는 표시 없음
  await page.goto('/deals?fCode=E2E0917-B')
  await expect(rowOf(page, 'E2E0917-B').locator('[data-memo]')).toHaveCount(0)
})
