import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

/** 2026-10-21 요청 — 매출수단 고르기(필터·목록에서 수정), 거래 목록 엑셀 = 화면 그대로 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
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
const saved = (page: Page) => page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/deals')

async function download(page: Page, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()])
  const wb = XLSX.read(readFileSync((await dl.path())!))
  return { name: dl.suggestedFilename(), rows: XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) }
}

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('매출수단 — 목록에서 바로 고르고, 필터로 골라 본다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  const cell = () => rowOf(page, 'E2E0916-LEAD').locator('[data-col=salesMethod]')
  await cell().getByTitle('클릭해서 매출수단 선택').click()
  const choice = (await cell().getByLabel('매출수단 선택').locator('option').nth(1).innerText()).trim()
  await Promise.all([saved(page), cell().getByLabel('매출수단 선택').selectOption({ label: choice })])
  await expect(cell()).toHaveText(choice)
  await page.goto('/deals?fCode=E2E0916&year=all')
  await ready(page)
  await expect(cell()).toHaveText(choice)

  // 필터: 고른 수단만
  await page.getByLabel('매출수단 검색').selectOption({ label: choice })
  await page.waitForURL(/fSalesMethod=\d+/)
  await expect(rowOf(page, 'E2E0916-LEAD')).toHaveCount(1)
  for (const t of await page.locator('[data-slot=deals-scroll] tbody [data-col=salesMethod]').allInnerTexts()) expect(t.trim()).toBe(choice)
  // 공백: 나머지 픽스처만, LEAD 는 빠진다
  await page.getByLabel('매출수단 검색').selectOption({ label: '공백' })
  await page.waitForURL(/fSalesMethod=-/)
  await expect(rowOf(page, 'E2E0916-MEMBER')).toHaveCount(1)
  await expect(rowOf(page, 'E2E0916-LEAD')).toHaveCount(0)
  for (const t of await page.locator('[data-slot=deals-scroll] tbody [data-col=salesMethod]').allInnerTexts()) expect(t.trim()).toBe('-')

  // 다시 비우기
  await page.goto('/deals?fCode=E2E0916-LEAD&year=all')
  await ready(page)
  await cell().getByTitle('클릭해서 매출수단 선택').click()
  await Promise.all([saved(page), cell().getByLabel('매출수단 선택').selectOption({ label: '-' })])
  await expect(cell()).toHaveText('-')
})

test('엑셀 내보내기 — 위 버튼·필터줄 아이콘 모두 화면과 같은 행·컬럼', async ({ page }) => {
  await login(page)
  await page.goto('/deals?fCode=E2E0916&year=all&sort=code&dir=asc')
  await ready(page)
  const screenCodes = (await page.locator('[data-slot=deals-scroll] tbody td:first-child a').allInnerTexts()).map((t) => t.trim())
  expect(screenCodes.length).toBeGreaterThan(1)

  for (const click of [
    () => page.getByRole('button', { name: '엑셀 내보내기' }).first().click(),
    () => page.locator('[data-slot=deals-section]').getByRole('button', { name: '엑셀 내보내기' }).click(),
  ]) {
    const { name, rows } = await download(page, click)
    expect(name).toMatch(/\.xlsx$/)
    const [head, ...body] = rows
    expect(head.slice(0, 25)).toEqual([
      '거래코드', '귀속', '상품구분', '담당', '발행처', '실광고주', '매체사', '품목명',
      '매출', '부가세', '총매출(VAT 포함)', '매입', '부가세', '총매입(VAT 포함)',
      '입금', '결산', '매출수단', '매출계산서 발행일', '매입계산서 발행일',
      '입금예정일', '입금일', '결산연월일', '결산일', '손익', '인센티브(%)',
    ])
    // 같은 필터·같은 순서
    expect(body.map((r) => r[0])).toEqual(screenCodes)

    // 한 행을 화면 칸과 하나씩 맞춰 본다
    const row = rowOf(page, 'E2E0916-MEMBER')
    const x = body.find((r) => r[0] === 'E2E0916-MEMBER')!
    const num = (t: string) => Number(t.replace(/[^\d-]/g, ''))
    expect(x[7]).toBe((await row.locator('td').nth(7).innerText()).trim())
    expect(x[8]).toBe(num(await row.locator('td').nth(8).innerText()))
    expect(x[10]).toBe(num(await row.locator('[data-col=salesGross]').innerText()))
    expect(x[23]).toBe(num(await row.locator('td').nth(20).innerText()))
    expect(x[25]).toBe(num(await row.locator('[data-col=incentiveAmount]').innerText()))
  }
})
