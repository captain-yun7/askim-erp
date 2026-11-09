import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026.11.02 요청 — 거래 목록 다섯 가지 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const ready = async (page: Page) => {
  await page.locator('[data-bulk-ready]').waitFor({ timeout: 30_000 })
  const btn = page.locator('[data-overdue-dialog]').getByRole('button', { name: '확인' })
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click()
    await page.locator('[data-overdue-dialog]').waitFor({ state: 'detached' })
  }
}
const sqlRun = (q: string) =>
  execSync(`npx tsx -e "import('./scripts/_env').then(async()=>{const {db}=await import('@/lib/db/client');const {sql}=await import('drizzle-orm');const r=await db.execute(sql.raw(process.env.Q));console.log(JSON.stringify(r.rows??r));process.exit(0)})"`, { env: { ...process.env, Q: q } }).toString().trim().split('\n').pop()!

// 결산연월일: 일 없는 2026-11 / 2026-11-02 / 2026-11-15 / 2026-12-02
const FIX = [
  ['E2E1102-MONTH', 11, null, 3_000_000],
  ['E2E1102-D02', 11, 2, 1_000_000],
  ['E2E1102-D15', 11, 15, 2_000_000],
  ['E2E1102-DEC', 12, 2, 4_000_000],
] as const

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
  sqlRun(`insert into deal (deal_code, item_name, accrual_year, accrual_month, status, settlement_year, settlement_month, settlement_day, purchase_amount_net, purchase_vat, purchase_amount_gross, purchase_paid_status) values ${FIX.map(([c, m, d, amt]) => `('${c}', 'E2E거래1102-${c}', 2026, 10, 'confirmed', 2026, ${m}, ${d ?? 'null'}, ${amt}, ${amt / 10}, ${amt * 1.1}, 'pending')`).join(', ')}`)
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

const codes = async (page: Page) =>
  (await page.locator('tbody tr[data-row-id] td a[href^="/deals/"]').allInnerTexts()).map((t) => t.trim()).filter((t) => t.startsWith('E2E1102'))

test('① 결과가 오기 전에 검색칸을 지우고 다시 쳐도 글자가 사라지지 않고, Enter 로 바로 반영된다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?q=E2E1102')
  await ready(page)
  // 운영처럼 느린 응답 — 앞 검색 결과가 늦게 도착
  await page.route('**/deals**', async (r) => {
    if (r.request().headers()['rsc']) await new Promise((res) => setTimeout(res, 2000))
    await r.continue()
  })
  const box = page.locator('input[data-column-filter=fPurchaseDue]')
  await box.click()
  await box.pressSequentially('20261102', { delay: 30 })
  await box.press('Enter')
  await page.waitForTimeout(300)
  await box.press('ControlOrMeta+a')
  await box.press('Backspace')
  await box.pressSequentially('2612', { delay: 50 })
  // 앞 결과(20261102) 도착 후에도 새로 친 글자·커서 그대로
  await expect(page).toHaveURL(/fPurchaseDue=20261102/)
  await page.waitForTimeout(2500)
  await expect(box).toHaveValue('2612')
  await expect(box).toBeFocused()
  await box.press('Enter')
  await expect(page).toHaveURL(/fPurchaseDue=2612/, { timeout: 10_000 })
  await expect.poll(() => codes(page), { timeout: 10_000 }).toEqual(['E2E1102-DEC'])
})

test('② 날짜를 짧게 — 2611 은 11월 전체, 261102 는 그 날짜만(일 없는 11월 건은 빠짐)', async ({ page }) => {
  await login(page)
  await page.goto('/deals?q=E2E1102&fPurchaseDue=2611')
  await ready(page)
  expect((await codes(page)).sort()).toEqual(['E2E1102-D02', 'E2E1102-D15', 'E2E1102-MONTH'])
  await page.goto('/deals?q=E2E1102&fPurchaseDue=261102')
  await ready(page)
  expect(await codes(page)).toEqual(['E2E1102-D02'])
  // 20 을 붙여도 같다
  await page.goto('/deals?q=E2E1102&fPurchaseDue=20261102')
  await ready(page)
  expect(await codes(page)).toEqual(['E2E1102-D02'])
})

test('③ 칸 제목을 누르면 그 칸으로 정렬, 한 번 더 누르면 반대로 — 모든 칸에 정렬', async ({ page }) => {
  await login(page)
  await page.goto('/deals?q=E2E1102')
  await ready(page)
  // 칸 제목마다 정렬 단추 — 정렬 기준 중 칸이 없는 '작성순'만 빼고 모두 (DEAL_SORT_LABEL)
  const keys = await page.locator('thead [data-sort-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-sort-key')))
  const { DEAL_SORT_LABEL } = await import('../src/lib/deal-sort')
  expect(keys.sort()).toEqual(Object.keys(DEAL_SORT_LABEL).filter((k) => k !== 'created').sort())
  await page.locator('thead [data-sort-key=purchase]').click()
  await expect(page).toHaveURL(/sort=purchase/)
  await expect.poll(() => codes(page)).toEqual(['E2E1102-DEC', 'E2E1102-MONTH', 'E2E1102-D15', 'E2E1102-D02'])
  await expect(page.locator('thead [data-sort-key=purchase]')).toHaveAttribute('aria-sort', 'descending')
  await page.locator('thead [data-sort-key=purchase]').click()
  await expect(page).toHaveURL(/dir=asc/)
  await expect.poll(() => codes(page)).toEqual(['E2E1102-D02', 'E2E1102-D15', 'E2E1102-MONTH', 'E2E1102-DEC'])
  // 결산연월일 오름차순 — 일 없는 11월은 11월 1일로
  await page.locator('thead [data-sort-key=settlement]').click()
  await page.locator('thead [data-sort-key=settlement]').click()
  await expect(page).toHaveURL(/sort=settlement.*dir=asc|dir=asc.*sort=settlement/)
  await expect.poll(() => codes(page)).toEqual(['E2E1102-MONTH', 'E2E1102-D02', 'E2E1102-D15', 'E2E1102-DEC'])
  // 위쪽 정렬 고르기에도 같은 기준
  await expect(page.getByRole('combobox', { name: '정렬 기준' })).toContainText('결산연월일순')
})

test('④ 결산일을 넣으면 결산, 지우면 미결산', async ({ page }) => {
  await login(page)
  await page.goto('/deals?q=E2E1102-D02')
  await ready(page)
  const row = page.locator('tbody tr[data-row-id]').filter({ hasText: 'E2E1102-D02' })
  const pill = row.locator('[data-paid-side=purchase]')
  await expect(pill).toHaveText('미결산')
  await row.locator('[data-inline-field=purchasePaidDate]').click()
  const input = row.getByLabel('purchasePaidDate 입력')
  await input.fill('2026-10-30')
  await input.press('Enter')
  await expect(pill).toHaveText('결산')
  expect(JSON.parse(sqlRun(`select purchase_paid_status::text s from deal where deal_code='E2E1102-D02'`))[0].s).toBe('completed')
  await row.locator('[data-inline-field=purchasePaidDate]').click()
  await row.getByLabel('purchasePaidDate 입력').fill('')
  await row.getByLabel('purchasePaidDate 입력').press('Enter')
  await expect(pill).toHaveText('미결산')
  expect(JSON.parse(sqlRun(`select purchase_paid_status::text s, purchase_paid_date d from deal where deal_code='E2E1102-D02'`))[0]).toEqual({ s: 'pending', d: null })
})

test('⑤ 매출 쪽·매입 쪽 날짜 칸 제목, 입금·결산 표시가 서로 다른 색', async ({ page }) => {
  await login(page)
  await page.goto('/deals?q=E2E1102')
  await ready(page)
  const bg = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor)
  const plain = await bg('thead th:has([data-sort-key=item])')
  const sales = await bg('thead th[data-side=sales]')
  const purchase = await bg('thead th[data-side=purchase]')
  expect(new Set([plain, sales, purchase]).size).toBe(3)
  expect(await page.locator('thead th[data-side=sales]').count()).toBe(2)
  expect(await page.locator('thead th[data-side=purchase]').count()).toBe(6)
  // 11/09 — 매체사·매입·부가세·총매입 제목도 매입계산서 발행일과 같은 분홍
  for (const key of ['supplier', 'purchase', 'purchaseVat', 'purchaseGross']) {
    expect(await bg(`thead th:has([data-sort-key=${key}])`)).toBe(purchase)
  }
  for (const key of ['sales', 'salesVat', 'salesGross', 'issuer']) {
    expect(await bg(`thead th:has([data-sort-key=${key}])`)).toBe(plain)
  }
  // 입금(완료)·결산(완료) 점 색이 다르다
  sqlRun(`update deal set sales_paid_status='completed', purchase_paid_status='completed', sales_amount_net=1000 where deal_code='E2E1102-DEC'`)
  await page.reload()
  await ready(page)
  const row = page.locator('tbody tr[data-row-id]').filter({ hasText: 'E2E1102-DEC' })
  const dot = (side: string) => row.locator(`[data-paid-side=${side}] > span`).evaluate((e) => getComputedStyle(e).backgroundColor)
  await expect(row.locator('[data-paid-side=sales]')).toHaveText('입금')
  await expect(row.locator('[data-paid-side=purchase]')).toHaveText('결산')
  expect(await dot('sales')).not.toBe(await dot('purchase'))
})

test('11/03 결산 점은 빨강, 미입금·미결산 점은 회색', async ({ page }) => {
  await login(page)
  sqlRun(`update deal set sales_paid_status='pending', purchase_paid_status='pending', sales_amount_net=1000 where deal_code='E2E1102-D15'`)
  sqlRun(`update deal set sales_paid_status='completed', purchase_paid_status='completed', sales_amount_net=1000 where deal_code='E2E1102-DEC'`)
  await page.goto('/deals?q=E2E1102')
  await ready(page)
  // 브라우저가 oklch 로 돌려줘도 비교할 수 있게 캔버스로 RGB 변환
  const rgb = (code: string, side: string) =>
    page.locator('tbody tr[data-row-id]').filter({ hasText: code }).locator(`[data-paid-side=${side}] > span`).evaluate((e) => {
      const c = document.createElement('canvas').getContext('2d')!
      c.fillStyle = getComputedStyle(e).backgroundColor
      c.fillRect(0, 0, 1, 1)
      return Array.from(c.getImageData(0, 0, 1, 1).data.slice(0, 3))
    })
  const red = await rgb('E2E1102-DEC', 'purchase')
  expect(red[0] - Math.max(red[1], red[2])).toBeGreaterThan(80)
  // 11/05 요청: 너무 진하지 않게 — 진한 빨강(red-500 ≈ 44,54)보다 밝은 빨강
  expect(Math.min(red[1], red[2])).toBeGreaterThan(80)
  const redText = await page.locator('tbody tr[data-row-id]').filter({ hasText: 'E2E1102-DEC' }).locator('[data-paid-side=purchase]').evaluate((e) => {
    const c = document.createElement('canvas').getContext('2d')!
    c.fillStyle = getComputedStyle(e).color
    c.fillRect(0, 0, 1, 1)
    return Array.from(c.getImageData(0, 0, 1, 1).data.slice(0, 3))
  })
  expect(redText[0], '결산 글씨도 밝은 빨강').toBeGreaterThan(220)
  const green = await rgb('E2E1102-DEC', 'sales')
  expect(green[1]).toBeGreaterThan(green[0])
  for (const side of ['sales', 'purchase']) {
    const [r, g, b] = await rgb('E2E1102-D15', side)
    expect(Math.max(r, g, b) - Math.min(r, g, b), side).toBeLessThan(25)
  }
  await expect(page.locator('tbody tr[data-row-id]').filter({ hasText: 'E2E1102-D15' }).locator('[data-paid-side=purchase]')).toHaveText('미결산')
})

test('11/03 입금이 없는 줄도 결산 표시 위치가 같다', async ({ page }) => {
  await login(page)
  sqlRun(`update deal set sales_amount_net=null where deal_code='E2E1102-MONTH'`)
  sqlRun(`update deal set sales_amount_net=1000, sales_paid_status='pending' where deal_code='E2E1102-D02'`)
  sqlRun(`update deal set sales_amount_net=1000, sales_paid_status='completed' where deal_code='E2E1102-DEC'`)
  await page.goto('/deals?q=E2E1102')
  await ready(page)
  const x = (code: string) =>
    page.locator('tbody tr[data-row-id]').filter({ hasText: code }).locator('[data-paid-side=purchase] > span').evaluate((e) => e.getBoundingClientRect().left)
  const noSales = await x('E2E1102-MONTH')
  expect(Math.abs((await x('E2E1102-D02')) - noSales)).toBeLessThan(1)
  expect(Math.abs((await x('E2E1102-DEC')) - noSales)).toBeLessThan(1)
})

test('③-2 정렬 기준 전부 — 양쪽 방향 모두 목록이 오류 없이 뜬다', async ({ page }) => {
  test.setTimeout(240_000)
  await login(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { DEAL_SORT_LABEL } = await import('../src/lib/deal-sort')
  for (const key of Object.keys(DEAL_SORT_LABEL)) {
    for (const dir of ['', '&dir=asc']) {
      const res = await page.goto(`/deals?q=E2E1102&sort=${key}${dir}`)
      expect(res?.status(), `${key}${dir}`).toBe(200)
      await page.locator('[data-bulk-ready]').waitFor({ timeout: 30_000 })
      expect(await codes(page), `${key}${dir}`).toHaveLength(4)
    }
  }
  expect(errors).toEqual([])
})
