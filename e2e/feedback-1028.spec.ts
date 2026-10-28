import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026.10.28 요청 — 결산연월일 검색은 화면 값으로, 거래 복사 시 날짜도 복사 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const sqlRun = (q: string) =>
  execSync(`npx tsx -e "import('./scripts/_env').then(async()=>{const {db}=await import('@/lib/db/client');const {sql}=await import('drizzle-orm');const r=await db.execute(sql.raw(process.env.Q));console.log(JSON.stringify(r.rows??r));process.exit(0)})"`, { env: { ...process.env, Q: q } }).toString().trim().split('\n').pop()!
const codes = (page: Page) => page.locator('[data-slot=deals-scroll] tbody tr td a[href^="/deals/"]').allInnerTexts()

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
  // 팀장 거래: 옛 결산예정일은 10월인데 화면 결산연월은 11월 (운영 AO260903 과 같은 모양) / 팀원 거래: 2026-10-15
  sqlRun(`update deal set purchase_due_date='2026-10-30', settlement_year=2026, settlement_month=11, settlement_day=null where deal_code='E2E0916-LEAD'`)
  sqlRun(`update deal set settlement_year=2026, settlement_month=10, settlement_day=15, sales_due_date='2026-10-20', sales_paid_date='2026-10-21', sales_invoice_date='2026-10-08' where deal_code='E2E0916-MEMBER'`)
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('결산연월일 검색 — 화면에 보이는 결산연월일로만 찾는다', async ({ page }) => {
  await login(page)
  for (const [q, want] of [['202610', ['E2E0916-MEMBER']], ['2026-10-15', ['E2E0916-MEMBER']], ['2026-10-30', []], ['202611', ['E2E0916-LEAD']]] as const) {
    await page.goto(`/deals?fCode=E2E0916&year=all&fPurchaseDue=${q}`)
    await page.waitForLoadState('networkidle')
    expect((await codes(page)).map((c) => c.trim()).filter((c) => c.startsWith('E2E0916')).sort(), q).toEqual([...want])
  }
})

test('거래 복사 — 입금예정일·입금일·매출 세계발행일·결산연월일도 복사된다', async ({ page }) => {
  await login(page)
  const id = JSON.parse(sqlRun(`select id from deal where deal_code='E2E0916-MEMBER'`))[0].id
  await page.goto(`/deals/new?copy=${id}`)
  await expect(page.locator('[data-slot=copy-banner]')).toContainText('결산연월일은 복사했고')
  const digits = async (label: string) => (await page.getByLabel(label, { exact: true }).inputValue()).replace(/\D/g, '')
  expect(await digits('salesDueDate')).toMatch(/^(20)?261020$/)
  expect(await digits('salesPaidDate')).toMatch(/^(20)?261021$/)
  expect(await digits('salesInvoiceDate')).toMatch(/^(20)?261008$/)
  expect(await digits('결산일')).toBe('15')
  await expect(page.getByLabel('dealCode', { exact: true }).or(page.getByPlaceholder('예) AM260917-1'))).toHaveValue('')
})
