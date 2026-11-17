import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * 2026-11-17 요청 — 결산인데 결산일 '-' 인 거래는 실제로 나가지 않는 매입(고정비 처리, 인센티브용으로만 금액 유지).
 * 거래 목록 위 합계뿐 아니라 대시보드·리포트에서도 매입은 빼고 손익은 되돌린다. 목록에서 결산일을 지우면 위 합계가 바로 바뀐다.
 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const Y = 2031 // 다른 데이터와 섞이지 않는 연도

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

const now = new Date(Date.now() + 9 * 3600_000) // 대시보드는 이번 달
const CUR = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 }

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
  const [{ id: cp }] = JSON.parse(sqlRun(`insert into counterparty (name) values ('E2E거래처1117') returning id`))
  const [{ id: cat }] = JSON.parse(sqlRun(`select id from deal_category order by display_order limit 1`))
  const ins = (code: string, y: number, m: number, sales: number, purchase: number, paidDate: string) =>
    `('${code}', 'E2E거래1117-${code}', ${y}, ${m}, ${y}, ${m}, 'confirmed', ${cat}, '${cp}', '${cp}', ${sales}, ${sales / 10}, ${sales * 1.1}, ${purchase}, ${purchase / 10}, ${purchase * 1.1}, 'completed', ${paidDate})`
  sqlRun(
    `insert into deal (deal_code, item_name, accrual_year, accrual_month, settlement_year, settlement_month, status, category_id, issuer_counterparty_id, supplier_counterparty_id, sales_amount_net, sales_vat, sales_amount_gross, purchase_amount_net, purchase_vat, purchase_amount_gross, purchase_paid_status, purchase_paid_date) values ` +
      [
        ins('E2E1117-PAID', Y, 3, 2_000_000, 1_110_000, `'${Y}-03-20'`), // 실제 지급 → 매입에 들어감
        ins('E2E1117-FIXED', Y, 3, 4_000_000, 3_330_000, 'null'), // 결산 + 결산일 '-' → 매입에서 빠짐
        ins('E2E1117-DASH', CUR.y, CUR.m, 0, 4_440_000, 'null'), // 대시보드 이번 달
      ].join(', '),
  )
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

// 손익 = 89만 + 67만 + 되돌린 매입 333만 = 489만 / 매입(VAT 포함)은 PAID 122.1만만
const PROFIT = '4,890,000'
const PURCHASE_GROSS = '1,221,000'
const PURCHASE_GROSS_ALL = '4,884,000'

test('매출장표 — 귀속월 매입에서 빠지고, 근거 내역에도 없다', async ({ page }) => {
  await login(page)
  await page.goto(`/reports/ledger?year=${Y}&half=h1`)
  const row = page.locator('[data-slot=ledger-table] tr').filter({ has: page.locator('[data-drill=cogs_accrual]') })
  await expect(row).toContainText(PURCHASE_GROSS)
  await expect(row).not.toContainText(PURCHASE_GROSS_ALL)
  await row.locator('[data-drill=cogs_accrual]').filter({ hasText: PURCHASE_GROSS }).first().click()
  const dlg = page.locator('[data-drill-dialog]')
  await expect(dlg).toContainText('E2E1117-PAID')
  await expect(dlg).not.toContainText('E2E1117-FIXED')
})

test('월별 수금결산 — 결산 예정에서 빠지고, 근거 내역에도 없다', async ({ page }) => {
  await login(page)
  await page.goto(`/reports/collection?year=${Y}`)
  const planned = page.locator('[data-slot=collection-table] tr[data-row="planned"]').filter({ has: page.locator('[data-drill=col_purchase_planned]') })
  await expect(planned).toContainText(PURCHASE_GROSS)
  await expect(planned).not.toContainText(PURCHASE_GROSS_ALL)
  await planned.locator('[data-drill=col_purchase_planned]').filter({ hasText: PURCHASE_GROSS }).first().click()
  const dlg = page.locator('[data-drill-dialog]')
  await expect(dlg).toContainText('E2E1117-PAID')
  await expect(dlg).not.toContainText('E2E1117-FIXED')
})

test('TOP 거래처·매출분석·사업계획 — 손익에 뺀 매입이 되돌아가고, 매체사 매입에서 빠진다', async ({ page }) => {
  await login(page)
  await page.goto(`/reports/top-counterparties?year=${Y}`)
  await expect(page.locator('tbody tr').filter({ hasText: 'E2E거래처1117' })).toContainText(PROFIT)

  await page.goto(`/reports/sales-analysis?year=${Y}`)
  await expect(page.locator('main')).toContainText(PROFIT)
  const supplierRow = page.locator('tbody tr').filter({ hasText: 'E2E거래처1117' })
  await expect(supplierRow.filter({ hasText: PURCHASE_GROSS }).first()).toBeVisible()
  await expect(page.locator('main')).not.toContainText(PURCHASE_GROSS_ALL)

  await page.goto(`/reports/plan?year=${Y}`)
  await expect(page.locator('main')).toContainText(PROFIT)
})

test('대시보드 — 이번 달 매입에서 빠지고, 결산일을 넣으면 들어간다', async ({ page }) => {
  await login(page)
  const card = (label: string) => page.locator('section > div').filter({ hasText: `${CUR.m}월 ${label}` }).first()
  const read = async (label: string) => Number((await card(label).innerText()).match(/₩\s*(-?[\d,]+)/)![1].replace(/,/g, ''))
  await page.goto('/')
  const [buy, profit] = [await read('매입'), await read('손익')]
  sqlRun(`update deal set purchase_paid_date='${CUR.y}-${String(CUR.m).padStart(2, '0')}-01' where deal_code='E2E1117-DASH'`)
  await page.reload()
  expect(await read('매입')).toBe(buy + 4_440_000)
  expect(await read('손익')).toBe(profit - 4_440_000)
})

test('거래 목록 — 결산일을 지우면 새로고침 없이 위 합계에서 바로 빠진다', async ({ page }) => {
  sqlRun(`update deal set purchase_paid_date='${Y}-03-25' where deal_code='E2E1117-FIXED'`)
  await login(page)
  await page.goto(`/deals?year=${Y}&q=E2E1117`)
  await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(2)
  const card = (label: string) => page.locator(`[data-card="${label}"]`)
  await expect(card('매입 합계')).toContainText('4,440,000')

  const row = page.locator('tbody tr[data-row-id]').filter({ hasText: 'E2E1117-FIXED' })
  await row.locator('[data-inline-field=purchasePaidDate]').click()
  const input = row.getByLabel('purchasePaidDate 입력')
  await input.fill('-')
  await input.press('Enter')
  await expect(card('매입 합계')).toContainText('1,110,000')
  await expect(card('손익')).toContainText(PROFIT)
  await expect(page.locator('main')).toContainText('매입 ₩111만')
})
