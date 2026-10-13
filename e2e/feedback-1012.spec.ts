import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-10-12 요청사항 — 수정요청 박스 권한·월별 횟수, 미국·중국법인 화면(부가세·계산서 발행일 없음, 환율·손익(KRW)) */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const MEMBER = { email: 'member.e2e@askim.local', password: PW }

async function login(page: Page, who = ADMIN) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
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
const headers = (page: Page) => page.locator('[data-slot=deals-scroll] thead tr').first().locator('th').allInnerTexts()
async function switchTo(page: Page, entity: 'kr' | 'us') {
  await page.getByLabel('법인 선택').selectOption(entity)
  await expect(page.locator('[data-slot=entity-switcher]')).toHaveAttribute('data-entity', entity)
  await page.waitForLoadState('networkidle')
}

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
  execSync('npx tsx scripts/e2e-fixture-1012.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('수정요청은 관리자만 걸고, 수정완료는 담당자 본인이 한다 · 월별 횟수가 집계되고 관리자가 고친다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  const mark = rowOf(page, 'E2E0916-MEMBER').locator('[data-review]')
  await mark.click()
  const menu = rowOf(page, 'E2E0916-MEMBER').locator('[data-slot=review-menu]')
  // 바로 바뀌지 않고 메뉴가 열린다 — 실수 방지
  await expect(mark).toHaveAttribute('data-review', 'none')
  await menu.getByRole('menuitem', { name: '수정요청 표시' }).click()
  await expect(mark).toHaveAttribute('data-review', 'requested')
  await page.waitForLoadState('networkidle')

  // 집계 화면: 팀원 이번 달 1회
  const month = new Date().getMonth() + 1
  await page.goto('/review-requests')
  const memberRow = page.locator('[data-slot=review-count-table] tbody tr', { hasText: 'E2E팀원' })
  const cell = memberRow.locator('td').nth(month)
  await expect(cell).toHaveText('1')
  // 관리자가 0회로 고친다 (차감)
  await cell.getByRole('button').click()
  await cell.locator('input').fill('0')
  await cell.locator('input').press('Enter')
  await expect(cell.locator('[data-adjusted]')).toHaveText('0')
  await page.reload()
  await expect(memberRow.locator('td').nth(month)).toHaveText('0')

  // 담당자(영업): 수정요청이 걸린 본인 거래만 수정완료로 바꿀 수 있다
  await login(page, MEMBER)
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  const own = rowOf(page, 'E2E0916-MEMBER').locator('[data-review]')
  await own.click()
  const items = rowOf(page, 'E2E0916-MEMBER').locator('[data-slot=review-menu] [role=menuitem]')
  await expect(items).toHaveText(['수정완료 표시'])
  await items.first().click()
  await expect(own).toHaveAttribute('data-review', 'done')
  await page.waitForLoadState('networkidle')
  // 수정완료가 된 뒤에는 담당자가 더 바꿀 수 없다
  await page.reload()
  await ready(page)
  await expect(rowOf(page, 'E2E0916-MEMBER').locator('[data-review]')).toBeDisabled()

  // 영업 계정은 집계 화면에 들어갈 수 없다
  await page.goto('/review-requests')
  await expect(page).not.toHaveURL(/review-requests/)
})

test('미국법인 목록: 부가세·계산서 발행일 열이 없고, 손익(KRW) = 손익 × 환율, 성과급 = 손익(KRW) × 5%', async ({ page }) => {
  await login(page)
  await page.goto('/deals')
  await switchTo(page, 'us')
  await page.goto('/deals?fCode=E2EUS-FX&year=all')
  await ready(page)
  const hs = (await headers(page)).map((h) => h.replace(/\s+/g, ''))
  expect(hs).not.toContain('부가세')
  expect(hs.some((h) => h.includes('계산서'))).toBe(false)
  const i = hs.indexOf('손익(KRW)')
  expect(i).toBeGreaterThan(hs.indexOf('손익'))
  expect(hs[i + 1]).toBe('인센티브(%)')
  const row = rowOf(page, 'E2EUS-FX')
  await expect(row.locator('[data-col=profitKrw]')).toHaveText('520,000')
  await expect(row.locator('[data-col=incentiveAmount]')).toHaveText('26,000')

  // 한국법인은 그대로
  await switchTo(page, 'kr')
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  const kr = (await headers(page)).map((h) => h.replace(/\s+/g, ''))
  expect(kr.filter((h) => h === '부가세')).toHaveLength(2)
  expect(kr).not.toContain('손익(KRW)')
})

test('미국법인 새 거래: 통화 USD 기본, 매출수단에 세금계산서·현금영수증 없음, 부가세·발행일 없음, 입금일 넣으면 환율 자동', async ({ page }) => {
  await login(page)
  await page.goto('/deals')
  await switchTo(page, 'us')
  await page.goto('/deals/new')
  await expect(page.locator('div:has(> label:text-is("통화")) [role=combobox]')).toHaveText(/USD/)
  await page.locator('div:has(> label:text-is("매출수단")) [role=combobox]').click()
  const opts = await page.getByRole('listbox').getByRole('option').allInnerTexts()
  expect(opts).not.toContain('세금계산서')
  expect(opts).not.toContain('현금영수증')
  expect(opts).toContain('계좌이체')
  await page.keyboard.press('Escape')
  await expect(page.locator('label', { hasText: '부가세' })).toHaveCount(0)
  await expect(page.locator('label', { hasText: '세계발행일' })).toHaveCount(0)

  await page.locator('div:has(> label:text-is("매출금")) input').fill('1000')
  await page.locator('div:has(> label:text-is("매입금")) input').fill('600')
  await page.getByLabel('salesPaidDate').fill('2026-09-30')
  await page.getByLabel('salesPaidDate').press('Enter')
  // 외부 환율 조회 (매매기준율, 한국은행 ECOS) — 값이 채워지고 손익(KRW)이 계산된다
  await expect(page.getByLabel('환율')).not.toHaveValue('', { timeout: 15_000 })
  await expect(page.locator('[data-slot=profit-krw] b')).not.toHaveText('-')
})
