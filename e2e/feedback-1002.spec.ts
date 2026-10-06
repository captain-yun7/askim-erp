import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-10-02 요청(인사관리 외) — 인사관리 메뉴, 거래 인센티브·성과급 칸, 거래처 구분 필수, 팀장 조회 범위 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const ACCOUNTANT = { email: 'accountant@askim.local', password: PW }
const LEAD = { email: 'lead.e2e@askim.local', password: PW }
const MEMBER = { email: 'member.e2e@askim.local', password: PW }

async function login(page: Page, who: { email: string; password: string }) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}

const dealRow = (page: Page, code: string) => page.locator('[data-slot=deals-scroll] tbody tr', { has: page.locator('td:first-child a', { hasText: new RegExp(`^${code}$`) }) })
const saved = (page: Page) => page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/deals')

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('① 인사관리 — 관리자는 추가·수정·삭제, 합계 카드가 맞게 바뀐다', async ({ page }) => {
  await login(page, ADMIN)
  await expect(page.locator('aside nav').getByRole('link', { name: '인사관리' })).toBeVisible()
  await page.goto('/hr')
  const name = `E2E구성원${Date.now()}`

  await page.getByRole('button', { name: '구성원 추가' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('성함').fill(name)
  await dialog.getByLabel('직급').fill('매니저')
  await dialog.getByLabel('부서').fill('E2E팀')
  await dialog.getByLabel('기본급(연봉)').fill('36000000')
  // 연봉을 넣으면 월급여가 12로 나눠 채워진다
  await expect(dialog.getByLabel('월급여')).toHaveValue('3,000,000')
  await dialog.getByLabel('인센티브').fill('E2E팀 손익의 5%')
  await dialog.getByRole('button', { name: '저장' }).click()

  const row = page.locator('[data-slot=hr-table] tbody tr', { hasText: name })
  await expect(row).toContainText('36,000,000')
  await expect(row).toContainText('3,000,000')
  await expect(row).toContainText('E2E팀 손익의 5%')

  // 수정 — 월급여만 따로 고칠 수 있다
  await row.getByRole('button', { name: `${name} 수정` }).click()
  await dialog.getByLabel('월급여').fill('3100000')
  await dialog.getByLabel('퇴사일').fill('20200101')
  await dialog.getByLabel('퇴사일').press('Tab')
  await dialog.getByRole('button', { name: '저장' }).click()
  await expect(row).toContainText('3,100,000')
  await expect(row).toContainText('2020-01-01')
  // 퇴사자는 "퇴사자도 표시"를 끄면 숨는다
  await page.getByLabel('퇴사자도 표시').uncheck()
  await expect(row).toHaveCount(0)
  await page.getByLabel('퇴사자도 표시').check()

  // 감사 로그에는 급여 값이 남지 않는다
  await page.goto('/admin/audit?action=hr.save')
  const log = page.locator('tbody tr', { hasText: name }).first()
  await expect(log).toContainText('월급여')
  await expect(log).not.toContainText('3100000')
  await expect(log).not.toContainText('3,100,000')

  await page.goto('/hr')
  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: `${name} 삭제` }).click()
  await expect(row).toHaveCount(0)
})

test('① 인사관리 — 관리자가 아니면 메뉴가 없고 주소로 들어가도 열리지 않는다', async ({ page }) => {
  for (const who of [ACCOUNTANT, LEAD, MEMBER]) {
    await login(page, who)
    await expect(page.locator('aside nav').getByRole('link', { name: '인사관리' })).toHaveCount(0)
    await page.goto('/hr')
    await page.waitForURL((u) => u.pathname !== '/hr')
    await expect(page.locator('[data-slot=hr-table]')).toHaveCount(0)
  }
})

test('② 인센티브 — 기본 5%, 성과급 = 요율 × 손익, 관리자가 요율을 고치면 다시 계산된다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fCode=E2E0916-LEAD')
  const row = dealRow(page, 'E2E0916-LEAD')
  const rate = row.locator('[data-col=incentiveRate]')
  const amount = row.locator('[data-col=incentiveAmount]')
  await expect(page.locator('thead')).toContainText('인센티브')
  await expect(page.locator('thead')).toContainText('성과급')
  await expect(rate).toHaveText('5%')
  await expect(amount).toHaveText('50,000')

  await rate.getByRole('button').click()
  await rate.getByLabel('인센티브 요율(%)').fill('12.5')
  await Promise.all([saved(page), rate.getByLabel('인센티브 요율(%)').press('Enter')])
  await expect(rate).toHaveText('12.5%')
  await expect(amount).toHaveText('125,000')
  await page.reload()
  await expect(rate).toHaveText('12.5%')
  await expect(amount).toHaveText('125,000')

  // 손익이 바뀌면 성과급도 따라 바뀐다
  await row.locator('td:nth-child(9) button').click()
  await row.locator('td:nth-child(9) input').fill('2000000')
  await Promise.all([saved(page), row.locator('td:nth-child(9) input').press('Enter')])
  await page.reload()
  await expect(amount).toHaveText('250,000')

  // 비우면 기본 5%
  await rate.getByRole('button').click()
  await rate.getByLabel('인센티브 요율(%)').fill('')
  await Promise.all([saved(page), rate.getByLabel('인센티브 요율(%)').press('Enter')])
  await page.reload()
  await expect(rate).toHaveText('5%')
  await expect(amount).toHaveText('100,000')
})

test('② 인센티브 — 영업은 본인 거래만 보고 요율은 고칠 수 없다', async ({ page }) => {
  await login(page, LEAD)
  await page.goto('/deals?fCode=E2E0916')
  const mine = dealRow(page, 'E2E0916-LEAD')
  await expect(mine.locator('[data-col=incentiveRate]')).toContainText('%')
  await expect(mine.locator('[data-col=incentiveRate] button')).toHaveCount(0)
  await expect(mine.locator('[data-col=incentiveAmount]')).not.toHaveText('-')
  // 팀장이라 팀원 거래는 보이지만 남의 성과급은 보이지 않는다
  const others = dealRow(page, 'E2E0916-MEMBER')
  await expect(others).toHaveCount(1)
  await expect(others.locator('[data-col=incentiveRate]')).toHaveText('-')
  await expect(others.locator('[data-col=incentiveAmount]')).toHaveText('-')
})

test('③ 거래처 구분 — 맨 위에 필수 표시, 고르지 않으면 저장되지 않는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/counterparties?q=E2E거래처0916-단건')
  await page.locator('tbody tr a').first().click()
  await page.waitForURL((u) => /^\/counterparties\/.+/.test(u.pathname))
  await expect(page.locator('label[for=cp-client-type]')).toHaveText('거래처 구분 *')
  // 상호명 바로 다음 칸
  const labels = await page.locator('form label, [data-slot=card-content] label').allInnerTexts()
  expect(labels.indexOf('거래처 구분 *')).toBe(labels.indexOf('상호명 *') + 1)

  await page.getByRole('button', { name: '저장' }).first().click()
  await expect(page.getByText('거래처 구분을 선택하세요')).toBeVisible()
  expect(new URL(page.url()).pathname).toMatch(/^\/counterparties\/.+/)

  await page.locator('#cp-client-type').selectOption('agency')
  await page.getByRole('button', { name: '저장' }).first().click()
  await page.waitForURL((u) => u.pathname === '/counterparties')
  await expect(page.locator('tbody tr', { hasText: 'E2E거래처0916-단건' }).locator('[data-col=clientType]')).toContainText('대행사')
})

// ④ 팀장 조회 범위(자기 팀만)는 기존 설정을 운영에 적용하는 건 — 동작 검증은 feedback-0916 ② 스펙
