import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-09-29 긴급 요청 — 거래 목록 필터가 두 개 같이 안 걸림, 뒤로가기·새로고침 뒤 필터가 안 먹음 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const MEMBER = { email: 'member.e2e@askim.local', password: PW }

async function login(page: Page, who: { email: string; password: string }) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}

const rows = (page: Page) => page.locator('[data-slot=deals-scroll] tbody tr')
const codes = (page: Page) => page.locator('[data-slot=deals-scroll] tbody tr td:first-child a').allInnerTexts()
const supplier = (page: Page) => page.getByLabel('fSupplier 검색')
const due = (page: Page) => page.getByLabel('fPurchaseDue 검색')
const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key)

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('결산예정 필터와 다른 필터를 같이 걸면 둘 다 적용된다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fSupplier=나스')
  const onlySupplier = await rows(page).count()
  await page.goto('/deals?fPurchaseDue=2026-09')
  const onlyDue = await rows(page).count()
  await page.goto('/deals?fSupplier=나스&fPurchaseDue=2026-09')
  await expect(rows(page).first()).toBeVisible()
  const both = await rows(page).count()
  expect(both).toBeLessThanOrEqual(Math.min(onlySupplier, onlyDue))
  for (const name of await page.locator('[data-slot=deals-scroll] tbody tr td[data-col=supplier]').allInnerTexts()) expect(name).toContain('나스')
  // 거래코드 필터와도 같이
  await page.goto('/deals?fCode=E2E0916-LEAD&fPurchaseDue=%2B')
  expect((await codes(page)).every((c) => c === 'E2E0916-LEAD')).toBe(true)
})

test('필터를 연달아 걸어도 앞 필터가 사라지지 않는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  await supplier(page).fill('나스')
  await supplier(page).press('Enter')
  await due(page).fill('2026-09')
  await due(page).press('Enter')
  await expect.poll(() => param(page, 'fPurchaseDue')).toBe('2026-09')
  expect(param(page, 'fSupplier')).toBe('나스')
})

test('입력만 해 둔 칸도 다른 칸에서 Enter 를 누르면 같이 적용된다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  await supplier(page).fill('나스')
  await due(page).fill('2026-09')
  await due(page).press('Enter')
  await expect.poll(() => param(page, 'fSupplier')).toBe('나스')
  expect(param(page, 'fPurchaseDue')).toBe('2026-09')
})

test('뒤로가기·새로고침 뒤에도 칸의 글자와 실제 필터가 같고 다시 걸린다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  const all = await rows(page).count()
  await supplier(page).fill('나스')
  await supplier(page).press('Enter')
  await expect.poll(() => rows(page).count()).toBeLessThan(all)
  const filtered = await rows(page).count()

  await page.goBack()
  await expect(supplier(page)).toHaveValue('')
  await expect.poll(() => rows(page).count()).toBe(all)

  await page.goForward()
  await expect(supplier(page)).toHaveValue('나스')
  await expect.poll(() => rows(page).count()).toBe(filtered)

  await page.reload()
  await expect(supplier(page)).toHaveValue('나스')
  await due(page).fill('2026-09')
  await due(page).press('Enter')
  await expect.poll(() => param(page, 'fPurchaseDue')).toBe('2026-09')
  expect(param(page, 'fSupplier')).toBe('나스')

  await supplier(page).fill('')
  await supplier(page).press('Enter')
  await expect.poll(() => param(page, 'fSupplier')).toBeNull()
  expect(param(page, 'fPurchaseDue')).toBe('2026-09')
})

test('결산예정 필터를 걸어도 영업 팀원은 본인 거래만 본다', async ({ page }) => {
  await login(page, MEMBER)
  for (const q of ['%2B', '2026', '-']) {
    await page.goto(`/deals?fPurchaseDue=${q}`)
    await page.waitForLoadState('networkidle')
    const list = await codes(page)
    expect(list.filter((c) => c !== 'E2E0916-MEMBER')).toEqual([])
  }
})

/** 통화 두 번째 요청 — 등록·수정·삭제 뒤에도 걸어 둔 필터가 남아 있어야 한다 */
test('판관비: 입력 화면에 갔다가 돌아와도 필터가 남는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/expenses?year=2026&month=4&categoryId=1')
  await expect(page.locator('#expenses-table tbody tr').first()).toBeVisible()
  await page.getByRole('link', { name: '판관비 입력' }).click()
  await page.waitForURL((u) => u.pathname === '/expenses/new')
  await page.getByRole('link', { name: '판관비 목록' }).click()
  await page.waitForURL((u) => u.pathname === '/expenses')
  expect(new URL(page.url()).search).toBe('?year=2026&month=4&categoryId=1')
  await page.getByRole('link', { name: '판관비 입력' }).click()
  await page.waitForURL((u) => u.pathname === '/expenses/new')
  await page.getByRole('button', { name: '취소' }).click()
  await page.waitForURL((u) => u.pathname === '/expenses')
  expect(param(page, 'month')).toBe('4')
})

test('거래처: 수정 저장 뒤 검색 조건이 남는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/counterparties?q=E2E거래처0916')
  await page.locator('tbody tr a').first().click()
  await page.waitForURL((u) => /^\/counterparties\/.+/.test(u.pathname))
  await page.getByRole('button', { name: '저장' }).first().click()
  await page.waitForURL((u) => u.pathname === '/counterparties')
  expect(param(page, 'q')).toBe('E2E거래처0916')
})

test('거래: 새 거래 화면에서 돌아오거나 상세에서 삭제해도 필터가 남는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fCode=E2ESORT&year=2026')
  await expect(rows(page).first()).toBeVisible()
  await page.getByRole('link', { name: '새 거래' }).click()
  await page.waitForURL((u) => u.pathname === '/deals/new')
  await page.getByRole('link', { name: '거래 목록' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')
  expect(param(page, 'fCode')).toBe('E2ESORT')

  const before = await rows(page).count()
  await rows(page).first().locator('td:first-child a').click()
  await page.waitForURL((u) => /^\/deals\/.+/.test(u.pathname))
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await page.waitForURL((u) => u.pathname === '/deals')
  expect(param(page, 'fCode')).toBe('E2ESORT')
  expect(param(page, 'year')).toBe('2026')
  await expect.poll(() => rows(page).count()).toBe(before - 1)
})

test('거래 목록에서 여러 건 삭제해도 필터가 남는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fCode=E2ESORT-1')
  await expect(rows(page).first()).toBeVisible()
  const before = await rows(page).count()
  await rows(page).first().getByRole('checkbox').check()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /선택 삭제/ }).click()
  await expect.poll(() => rows(page).count()).toBe(before - 1)
  expect(param(page, 'fCode')).toBe('E2ESORT-1')
  await expect(page.getByLabel('fCode 검색')).toHaveValue('E2ESORT-1')
})

test('메뉴로 목록을 다시 열면 필터가 초기화된다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/expenses?year=2026&month=4')
  await expect(page.locator('#expenses-table tbody tr').first()).toBeVisible()
  await page.locator('aside nav').getByRole('link', { name: '판관비' }).click()
  await page.waitForURL((u) => u.pathname === '/expenses' && u.search === '')
  await page.getByRole('link', { name: '판관비 입력' }).click()
  await page.waitForURL((u) => u.pathname === '/expenses/new')
  await page.getByRole('link', { name: '판관비 목록' }).click()
  await page.waitForURL((u) => u.pathname === '/expenses')
  expect(new URL(page.url()).search).toBe('')
})

/** 2026-09-29 추가 문의 — 필터로 행이 몇 건만 남으면 표가 끝까지 내려가지 않음 (요약 카드 접힘과 스크롤이 서로 되돌림) */
test('행이 적어도 표를 맨 아래까지 내릴 수 있다', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN)
  for (const height of [650, 700, 750, 800, 825, 850, 875, 900, 950, 1000]) {
    await page.setViewportSize({ width: 1800, height })
    await page.goto('/deals?fSupplier=과태료')
    await expect(rows(page).first()).toBeVisible()
    const box = page.locator('[data-slot=deals-scroll]')
    await box.hover()
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 200)
      await page.waitForTimeout(120)
    }
    await page.waitForTimeout(500)
    const gap = await box.evaluate((el) => Math.round(el.scrollHeight - el.clientHeight - el.scrollTop))
    expect(gap, `화면 높이 ${height}`).toBeLessThanOrEqual(1)
    // 마지막 행의 아래쪽이 표 상자 안에 들어와 있어야 한다
    const hidden = await box.evaluate((el) => {
      const last = [...el.querySelectorAll('tbody tr')].pop()!.getBoundingClientRect()
      return Math.round(last.bottom - el.getBoundingClientRect().bottom)
    })
    expect(hidden, `화면 높이 ${height}`).toBeLessThanOrEqual(1)
  }
})
