import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-11-05 요청 — 팀장이 팀원 인센티브 확인, 귀속월 ↔ 입금예정일 함께 바뀜 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
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

const sqlRun = (q: string) =>
  execSync(`npx tsx -e "import('./scripts/_env').then(async()=>{const {db}=await import('@/lib/db/client');const {sql}=await import('drizzle-orm');const r=await db.execute(sql.raw(process.env.Q));console.log(JSON.stringify(r.rows??r));process.exit(0)})"`, { env: { ...process.env, Q: q } }).toString().trim().split('\n').pop()!

const dealRow = (page: Page, code: string) => page.locator('[data-slot=deals-scroll] tbody tr', { has: page.locator('td:first-child a', { hasText: new RegExp(`^${code}$`) }) })
const inlineSaved = (page: Page) => page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/deals')

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('팀장은 팀원 거래의 인센티브를 보고(수정은 못 함), 담당자로 팀원을 골라도 합계가 나온다', async ({ page }) => {
  await login(page, LEAD)
  await page.goto('/deals?fCode=E2E0916')
  const member = dealRow(page, 'E2E0916-MEMBER')
  await expect(member.locator('[data-col=incentiveRate]')).toHaveText('5%')
  await expect(member.locator('[data-col=incentiveAmount]')).toHaveText('50,000')
  await expect(member.locator('[data-col=incentiveRate] button')).toHaveCount(0)
  // 다른 팀 거래가 보이더라도 인센티브는 보이지 않는다
  const other = dealRow(page, 'E2E0916-OTHER')
  if (await other.count()) await expect(other.locator('[data-col=incentiveAmount]')).toHaveText('-')

  // 담당자 필터로 팀원만 → 인센티브 합계 1건
  const [{ id }] = JSON.parse(sqlRun(`select id from users where email = 'member.e2e@askim.local'`)) as { id: string }[]
  await page.goto(`/deals?fCode=E2E0916&owner=${id}`)
  await expect(dealRow(page, 'E2E0916-LEAD')).toHaveCount(0)
  const card = page.locator('[data-card="인센티브 합계"]')
  await expect(card).toContainText('50,000')
  await expect(card).toContainText('1건')
})

test('팀원은 여전히 본인 거래 인센티브만 본다', async ({ page }) => {
  await login(page, MEMBER)
  await page.goto('/deals?fCode=E2E0916')
  await expect(dealRow(page, 'E2E0916-MEMBER').locator('[data-col=incentiveAmount]')).toHaveText('50,000')
  await expect(dealRow(page, 'E2E0916-LEAD')).toHaveCount(0)
})

test('입금예정일을 바꾸면 귀속월이, 귀속월을 바꾸면 입금예정일이 같은 달로 바뀐다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?year=all&fCode=E2E0916-THIRD')
  const row = () => dealRow(page, 'E2E0916-THIRD')
  const accrual = () => row().locator('td').filter({ has: page.locator('button[title="클릭해서 귀속연월 수정"]') })
  const due = () => row().locator('[data-inline-field=salesDueDate]')
  await expect(accrual()).toHaveText('26/9')

  // 입금예정일 11/30 → 귀속 26/11
  await due().click()
  await row().getByLabel('salesDueDate 입력').fill('2026-11-30')
  await Promise.all([inlineSaved(page), row().getByLabel('salesDueDate 입력').press('Enter')])
  await expect(due()).toHaveText('2026-11-30')
  await expect(accrual()).toHaveText('26/11')

  // 귀속 2027-02 → 입금예정일 2027-02-28 (2월엔 30일이 없어 말일)
  await accrual().locator('button').click()
  const month = row().locator('input[type=month]')
  await month.fill('2027-02')
  await Promise.all([inlineSaved(page), month.press('Enter')])
  await expect(accrual()).toHaveText('27/2')
  await expect(due()).toHaveText('2027-02-28')

  // 새로고침해도 그대로 (저장됨)
  await page.reload()
  await expect(accrual()).toHaveText('27/2')
  await expect(due()).toHaveText('2027-02-28')
})

test('입금예정일이 비어 있으면 귀속월만 바뀌고 날짜를 만들지 않는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?year=all&fCode=E2E0916-OTHER')
  const row = dealRow(page, 'E2E0916-OTHER')
  const accrualBtn = row.locator('button[title="클릭해서 귀속연월 수정"]')
  await accrualBtn.click()
  const month = row.locator('input[type=month]')
  await month.fill('2026-12')
  await Promise.all([inlineSaved(page), month.press('Enter')])
  await page.reload()
  await expect(dealRow(page, 'E2E0916-OTHER').locator('button[title="클릭해서 귀속연월 수정"]')).toHaveText('26/12')
  await expect(dealRow(page, 'E2E0916-OTHER').locator('[data-inline-field=salesDueDate]')).toHaveText('-')
})

test('거래 수정 화면 — 귀속월을 바꾸면 입금예정일이, 입금예정일을 바꾸면 귀속월이 따라 바뀐다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?year=all&fCode=E2E0916-LEAD')
  await dealRow(page, 'E2E0916-LEAD').locator('td:first-child a').click()
  await page.waitForURL((u) => /^\/deals\/[^/]+$/.test(u.pathname))
  const year = page.locator('div:has(> label:text-is("귀속연도")) input')
  const month = page.locator('div:has(> label:text-is("귀속월")) input')
  const due = page.getByLabel('salesDueDate')

  await due.fill('2026-10-31')
  await due.press('Tab')
  await expect(year).toHaveValue('2026')
  await expect(month).toHaveValue('10')

  await month.fill('11')
  await expect(due).toHaveValue('2026-11-30')
})
