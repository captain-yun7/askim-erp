import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-09-28 요청 — 리포트 > 매출분석보고서 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const URL_MAR = '/reports/sales-analysis?year=2031&month=3'

async function login(page: Page, who = ADMIN) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const rowsOf = async (page: Page, slot: string) =>
  (await page.locator(`[data-slot=${slot}] tbody tr`).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
const totalOf = async (page: Page, slot: string) => (await page.locator(`[data-slot=${slot}] tfoot tr`).first().innerText()).replace(/\s+/g, ' ').trim()

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0928.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('메뉴에서 열리고, 선택한 월의 표 5개가 같은 합계로 집계된다', async ({ page }) => {
  await login(page)
  await page.goto('/')
  await page.getByRole('link', { name: '매출분석보고서' }).click()
  await page.waitForURL((u) => u.pathname === '/reports/sales-analysis')
  await expect(page.getByRole('heading', { name: '매출분석보고서' })).toBeVisible()

  await page.goto(URL_MAR)
  // 1. 매출 거래처 — 금액 큰 순, 비율
  const clients = await rowsOf(page, 'by-client')
  expect(clients).toHaveLength(2)
  expect(clients[0]).toContain('E2E거래처0928-A')
  expect(clients[0]).toContain('3,300,000')
  expect(clients[0]).toContain('60.0%')
  expect(clients[1]).toContain('E2E거래처0928-B')
  expect(clients[1]).toContain('2,200,000')
  expect(clients[1]).toContain('40.0%')
  expect(await totalOf(page, 'by-client')).toContain('5,500,000')
  // 2. 산업군 — A 는 직거래, B 는 미지정
  expect(await rowsOf(page, 'by-client-type')).toEqual(['직거래 3,300,000 60.0%', '미지정 2,200,000 40.0%'])
  // 3. 상품
  expect(await rowsOf(page, 'by-category')).toEqual(['해외매체 3,300,000 60.0%', '영업대행 2,200,000 40.0%'])
  // 4. 담당자
  expect(await rowsOf(page, 'by-owner')).toEqual(['관리자 5,500,000 100.0%'])
  // 5. 매입 거래처
  const sup = await rowsOf(page, 'by-supplier')
  expect(sup).toHaveLength(1)
  expect(sup[0]).toContain('E2E거래처0928-매체')
  expect(sup[0]).toContain('2,750,000')
  for (const slot of ['by-client-type', 'by-category', 'by-owner']) expect(await totalOf(page, slot)).toContain('5,500,000')
  // 6. 누적 — 월 선택과 무관하게 그 해 전체(1월 거래 포함), VAT 제외, 손익율
  const cum = page.locator('[data-slot=cumulative] tbody tr', { hasText: '관리자' })
  await expect(cum).toContainText('10,000,000') // 3,000,000+1,000,000+1,000,000+5,000,000
  await expect(cum).toContainText('6,500,000') // 손익
  await expect(cum).toContainText('65.0%')
})

test('연도·월 필터 — 월을 바꾸면 그 달만, 전체는 연간', async ({ page }) => {
  await login(page)
  await page.goto(URL_MAR)
  const controls = page.locator('[data-slot=period-controls]')
  await controls.getByRole('button', { name: '1월', exact: true }).click()
  await page.waitForURL((u) => u.searchParams.get('month') === '1')
  expect(await totalOf(page, 'by-client')).toContain('5,500,000')
  expect(await rowsOf(page, 'by-client')).toHaveLength(1)
  await controls.getByRole('button', { name: '전체', exact: true }).click()
  await page.waitForURL((u) => u.searchParams.get('month') === 'all')
  expect(await totalOf(page, 'by-client')).toContain('11,000,000')
  await controls.getByRole('button', { name: '2월', exact: true }).click()
  await page.waitForURL((u) => u.searchParams.get('month') === '2')
  await expect(page.locator('[data-slot=by-client]')).toContainText('집계할 거래가 없습니다')
  await controls.getByRole('button', { name: '2026', exact: true }).click()
  await page.waitForURL((u) => u.searchParams.get('year') === '2026')
})

test('거래처 구분 — 보고서에서 바로 지정하면 산업군 분석에 반영, 거래처 목록에서 여러 곳 일괄 지정', async ({ page }) => {
  await login(page)
  await page.goto(URL_MAR)
  await expect(page.locator('[data-slot=unset-note]')).toContainText('1곳')
  await page.getByLabel('E2E거래처0928-B 구분').selectOption('agency')
  await expect.poll(() => rowsOf(page, 'by-client-type')).toEqual(['직거래 3,300,000 60.0%', '대행사 2,200,000 40.0%'])
  await expect(page.locator('[data-slot=unset-note]')).toHaveCount(0)

  // 거래처 목록: 구분 컬럼·필터·일괄 지정
  await page.goto('/counterparties?q=E2E거래처0928')
  await expect(page.locator('tbody tr', { hasText: 'E2E거래처0928-B' }).locator('td[data-col=clientType]')).toHaveText('대행사')
  await expect(page.locator('tbody tr', { hasText: 'E2E거래처0928-매체' }).locator('td[data-col=clientType]')).toHaveText('미지정')
  await expect(async () => {
    await page.getByLabel('E2E거래처0928-B 선택').click()
    await expect(page.locator('[data-slot=bulk-bar]')).toContainText('1건 선택', { timeout: 1500 })
  }).toPass()
  await page.getByLabel('E2E거래처0928-매체 선택').click()
  await page.getByLabel('구분 일괄 지정').selectOption('public')
  await expect(page.getByText("거래처 2곳의 구분을 '공공기관'")).toBeVisible()
  await expect(page.locator('td[data-col=clientType]', { hasText: '공공기관' })).toHaveCount(2)
  await page.goto('/counterparties?q=E2E거래처0928&ctype=public')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.goto('/counterparties?q=E2E거래처0928&ctype=none')
  await expect(page.locator('tbody tr')).toHaveCount(0)

  // 거래처 수정 화면에도 구분 칸
  await page.goto('/counterparties?q=E2E거래처0928-A')
  await page.getByRole('link', { name: 'E2E거래처0928-A' }).click()
  await expect(page.locator('#cp-client-type')).toHaveValue('direct')
})

test('엑셀 다운로드 — 표 6개가 시트로', async ({ page }) => {
  await login(page)
  await page.goto(URL_MAR)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /엑셀/ }).click()])
  expect(download.suggestedFilename()).toBe('매출분석보고서_2031-03.xlsx')
  const path = await download.path()
  const XLSX = await import('xlsx')
  const { readFileSync } = await import('node:fs')
  const wb = XLSX.read(readFileSync(path!), { type: 'buffer' })
  expect(wb.SheetNames).toEqual(['1.매출거래처', '2.산업군', '3.상품(매체)', '4.영업사원', '5.매입거래처', '6.누적'])
  const first = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['1.매출거래처'], { header: 1 })
  expect(first[3]).toEqual(['E2E거래처0928-A', '직거래', 3300000, 0.6])
  expect(first[first.length - 1]).toEqual(['총합계', '', 5500000, 1])
})

test('영업 계정은 접근할 수 없다', async ({ page }) => {
  execSync('npx tsx scripts/e2e-fixture-0917.ts', { stdio: 'inherit' })
  await login(page, { email: 'sales17.e2e@askim.local', password: 'askim2026!' })
  await expect(page.getByRole('link', { name: '매출분석보고서' })).toHaveCount(0)
  await page.goto(URL_MAR)
  await page.waitForURL((u) => u.pathname !== '/reports/sales-analysis')
})
