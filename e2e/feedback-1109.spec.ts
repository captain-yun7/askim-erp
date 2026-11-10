import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-11-09 요청 — 매체 가격 칸 3개(매입가 굵게), 결산인데 결산일 없는 거래는 목록 위 합계에서 매입 제외 */
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

// [코드, 매출, 매입, 결산상태, 결산일]
const DEALS = [
  ['E2E1109-PAID', 1_000_000, 400_000, 'completed', "'2026-10-15'"], // 결산 + 결산일 → 합계에 들어감
  ['E2E1109-FIXED', 500_000, 300_000, 'completed', 'null'], // 결산 + 결산일 '-' → 매입은 합계에서 뺌
  ['E2E1109-OPEN', 200_000, 100_000, 'pending', 'null'], // 미결산 → 합계에 들어감
] as const

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
  sqlRun(`insert into deal (deal_code, item_name, accrual_year, accrual_month, status, sales_amount_net, sales_vat, sales_amount_gross, purchase_amount_net, purchase_vat, purchase_amount_gross, purchase_paid_status, purchase_paid_date) values ${DEALS.map(([c, s, p, st, d]) => `('${c}', 'E2E거래1109-${c}', 2026, 10, 'confirmed', ${s}, ${s / 10}, ${s * 1.1}, ${p}, ${p / 10}, ${p * 1.1}, '${st}', ${d})`).join(', ')}`)
  const [{ id }] = JSON.parse(sqlRun(`insert into media (entity, code, name) values ('kr', 'E2EPRICE', 'E2E매체-가격3칸') returning id`))
  sqlRun(`insert into media_price (media_id, type, label, amount, sort_order) values (${id}, 'landlord', null, 20000000, 0), (${id}, 'net', '정면', 30000000, 0), (${id}, 'net', '측면', 35000000, 1), (${id}, 'sale', null, 40000000, 0)`)
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('매체 목록 — 가격이 매입가·입금가(Net)·판매가(Gross) 3칸, 매입가는 굵게', async ({ page }) => {
  await login(page)
  await page.goto('/media?q=E2E매체-가격3칸')
  const heads = await page.locator('thead th').allInnerTexts()
  const i = heads.indexOf('매입가')
  expect(i).toBeGreaterThan(-1)
  expect(heads.slice(i, i + 3)).toEqual(['매입가', '입금가(Net)', '판매가(Gross)'])
  expect(heads).not.toContain('가격')

  const row = page.locator('tbody tr[data-media-code="E2EPRICE"]')
  await expect(row.locator('[data-col=price-landlord]')).toHaveText('2,000만원')
  await expect(row.locator('[data-col=price-net]')).toHaveText('정면3,000만원외 1')
  await expect(row.locator('[data-col=price-sale]')).toHaveText('4,000만원')
  const weight = (sel: string) => row.locator(`${sel} .font-mono`).evaluate((e) => Number(getComputedStyle(e).fontWeight))
  expect(await weight('[data-col=price-landlord]')).toBeGreaterThanOrEqual(700)
  expect(await weight('[data-col=price-net]')).toBeLessThan(700)

  // 가격이 없는 칸은 '-'
  sqlRun(`delete from media_price where media_id=(select id from media where code='E2EPRICE') and type='sale'`)
  await page.reload()
  await expect(row.locator('[data-col=price-sale]')).toHaveText('-')
})

test('거래 목록 — 결산인데 결산일이 비어 있으면 위 합계의 매입·손익에서 빠진다 (거래 금액은 그대로)', async ({ page }) => {
  await login(page)
  await page.goto('/deals?year=all&q=E2E1109')
  await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(3)

  // 매출 170만 (전부), 매입 50만 (FIXED 30만 제외), 손익 120만
  const card = (label: string) => page.locator(`[data-card="${label}"]`)
  await expect(card('매출 합계')).toContainText('1,700,000')
  await expect(card('매입 합계')).toContainText('500,000')
  await expect(card('매입 합계')).toContainText('550,000') // VAT 포함
  await expect(card('손익')).toContainText('1,200,000')

  // 거래 한 줄의 매입·손익은 그대로 (인센티브 계산용)
  const fixed = page.locator('tbody tr[data-row-id]').filter({ hasText: 'E2E1109-FIXED' })
  await expect(fixed).toContainText('300,000')
  await expect(fixed).toContainText('200,000')

  // 결산일을 넣으면 다시 합계에 들어간다
  sqlRun(`update deal set purchase_paid_date='2026-10-20' where deal_code='E2E1109-FIXED'`)
  await page.reload()
  await expect(card('매입 합계')).toContainText('800,000')
  await expect(card('손익')).toContainText('900,000')
})
