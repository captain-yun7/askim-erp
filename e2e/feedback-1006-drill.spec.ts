import { test, expect, type Page } from '@playwright/test'

/** 2026-10-06 요청 — 매출장표·월별 수금결산 숫자의 근거 내역 보기 */
async function login(page: Page, email = 'admin@askim.local') {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', 'askim2026!')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}

const num = (t: string) => Number(t.replace(/[^\d-]/g, ''))

/** 칸을 눌러 근거 창의 합계가 칸 값과 같은지 확인하고 닫는다 */
async function openAndCheck(page: Page, row: string, nth: number) {
  const btn = page.locator(`tr[data-row="${row}"] [data-drill]`).nth(nth)
  const cell = num(await btn.innerText())
  await btn.click()
  const dialog = page.locator('[data-drill-dialog]')
  await expect(dialog.locator('[data-slot=drill-cell-value]')).toContainText(cell.toLocaleString('ko-KR'))
  await expect(dialog.locator('[data-slot=drill-total]')).toBeVisible()
  expect(num(await dialog.locator('[data-slot=drill-total]').innerText()), `${row} #${nth}`).toBe(cell)
  if (await dialog.locator('[data-slot=drill-check]').count()) await expect(dialog.locator('[data-slot=drill-check]')).toHaveAttribute('data-ok', 'true')
  return dialog
}

test('매출장표 — 총매출·매출원가 칸의 거래 내역 합계가 칸 값과 같다', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.goto('/reports/ledger?year=2026&half=h1')
  for (const row of ['sales_cash', 'sales_accrual', 'cogs_cash', 'cogs_accrual']) {
    const count = await page.locator(`tr[data-row="${row}"] [data-drill]`).count()
    // 첫 달, 가운데 달, 맨 끝(반기 합계)
    for (const nth of [0, Math.floor(count / 2), count - 1]) {
      const dialog = await openAndCheck(page, row, nth)
      await expect(dialog.locator('tbody tr').first().locator('a')).toHaveAttribute('href', /^\/deals\/.+/)
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    }
  }
})

test('매출장표 — 계산 행은 구성 행을 보여 주고, 눌러 내려가면 판관비 내역까지 이어진다', async ({ page }) => {
  await login(page)
  await page.goto('/reports/ledger?year=2026&half=h1')
  const dialog = await openAndCheck(page, 'op_cash', 0)
  await expect(dialog).toContainText('손익(통장)')
  await expect(dialog).toContainText('판매비와관리비')

  await dialog.locator('[data-part=sgna]').click()
  await expect(dialog).toContainText('- 고정비')
  await dialog.locator('[data-part=fixed]').click()
  const cat = dialog.locator('[data-part^=cat_]').first()
  const label = await cat.innerText()
  await cat.click()
  await expect(dialog.locator('[data-slot=drill-check]')).toHaveAttribute('data-ok', 'true')
  await expect(dialog).toContainText(label)

  // 검색하면 합계가 검색된 내역만으로 바뀐다
  const total = num(await dialog.locator('[data-slot=drill-total]').innerText())
  const first = (await dialog.locator('tbody tr').first().locator('td').nth(2).innerText()).trim()
  await dialog.getByLabel('내역 검색').fill(first)
  await expect.poll(async () => num(await dialog.locator('[data-slot=drill-total]').innerText())).toBeLessThanOrEqual(total)

  // 이전 단계로
  await dialog.getByRole('button', { name: '이전 단계' }).click()
  await expect(dialog.locator('[data-part^=cat_]').first()).toBeVisible()
})

test('월별 수금결산 — 여섯 종류 칸 모두 내역 합계가 칸 값과 같다', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.goto('/reports/collection?year=2026')
  for (const row of ['planned', 'done', 'outstanding']) {
    const count = await page.locator(`[data-slot=collection-table] tr[data-row="${row}"] [data-drill]`).count()
    expect(count).toBeGreaterThan(0)
    for (const nth of [...new Set([0, 1, 2, count - 2, count - 1])].filter((n) => n >= 0 && n < count)) {
      await openAndCheck(page, row, nth)
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-drill-dialog]')).toHaveCount(0)
    }
  }
})

test('영업 계정은 근거 내역을 볼 수 없다', async ({ page }) => {
  await login(page, 'park.jw@askim.local')
  await page.goto('/reports/ledger')
  await page.waitForURL((u) => u.pathname === '/deals')
})
