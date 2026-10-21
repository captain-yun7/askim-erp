import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

/** 2026-10-21 요청 2 — 띄어쓰기 무시 검색, 판관비 업로드 양식 다운로드, 거래처·판관비 내보내기 엑셀 */
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
const dealCodes = async (page: Page) => (await page.locator('[data-slot=deals-scroll] tbody td:first-child a').allInnerTexts()).map((t) => t.trim())

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

test('거래 검색 — 띄어쓰기를 다르게 넣어도 찾는다 (위 검색창 · 칸 검색)', async ({ page }) => {
  await login(page)
  // 값 'E2E거래0916-팀장' 을 띄어 쓴 검색어로
  await page.goto(`/deals?year=all&q=${encodeURIComponent('E2E 거래 0916 -팀장')}`)
  await ready(page)
  expect(await dealCodes(page)).toEqual(['E2E0916-LEAD'])
  await page.goto(`/deals?year=all&fItem=${encodeURIComponent('e2e거래 0916-팀 장')}`)
  await ready(page)
  expect(await dealCodes(page)).toEqual(['E2E0916-LEAD'])
  await page.goto(`/deals?year=all&fCode=${encodeURIComponent('E2E 0916-LE AD')}`)
  await ready(page)
  expect(await dealCodes(page)).toEqual(['E2E0916-LEAD'])
  // 칸 검색은 화면에서 입력해도 같다
  await page.goto('/deals?year=all')
  await ready(page)
  await page.getByLabel('fItem 검색').fill('E2E거래 0916-팀원')
  await page.getByLabel('fItem 검색').press('Enter')
  await page.waitForURL(/fItem=/)
  await expect.poll(() => dealCodes(page)).toEqual(['E2E0916-MEMBER'])
})

test('거래처 검색 — 띄어쓰기 없이 쳐도 띄어 쓴 이름을 찾고, 엑셀은 화면과 같다', async ({ page }) => {
  await login(page)
  // 값 '(매출처 없음)' 을 붙여 쓴 검색어로
  await page.goto(`/counterparties?q=${encodeURIComponent('매출처없음')}`)
  await expect(page.locator('tbody tr', { hasText: '(매출처 없음)' })).toHaveCount(1)

  // 구분 필터까지 화면과 같은 행 (전에는 구분 필터가 내보내기에 빠져 있었다)
  for (const query of ['?q=E2E거래처 0916', '?ctype=none&q=E2E']) {
    await page.goto(`/counterparties${query}`)
    const names = (await page.locator('tbody tr td:nth-child(3)').allInnerTexts()).map((t) => t.trim())
    expect(names.length).toBeGreaterThan(0)
    const { name, rows } = await download(page, () => page.getByRole('button', { name: '엑셀 내보내기' }).click())
    expect(name).toMatch(/\.xlsx$/)
    expect(rows[0].slice(0, 4)).toEqual(['상호명', '사업자번호', '역할', '구분'])
    expect(rows.slice(1).map((r) => r[0])).toEqual(names)
  }
})

test('판관비 — 띄어쓰기 무시 검색, 엑셀은 화면과 같은 행', async ({ page }) => {
  await login(page)
  await page.goto('/expenses')
  const firstItem = (await page.locator('tbody tr').first().locator('td').nth(2).innerText()).trim()
  test.skip(!firstItem || firstItem === '-', '판관비 데이터 없음')
  // 품목 글자 사이에 띄어쓰기를 넣어 검색
  const spaced = [...firstItem.replace(/\s/g, '')].join(' ')
  await page.goto(`/expenses?q=${encodeURIComponent(spaced)}`)
  const items = (await page.locator('tbody tr td:nth-child(3)').allInnerTexts()).map((t) => t.trim())
  expect(items).toContain(firstItem)

  const total = Number(await page.locator('[data-slot=expenses-total]').innerText().then((t) => t.replace(/\D/g, '')))
  const { name, rows } = await download(page, () => page.getByRole('button', { name: '엑셀 내보내기' }).click())
  expect(name).toMatch(/^판관비_.*\.xlsx$/)
  expect(rows[0]).toEqual(['지출일', '품목', '거래처', '항목', '수단', '금액'])
  expect(rows.length - 1).toBe(total)
  expect(rows.slice(1).map((r) => r[1])).toEqual(items)
  expect(typeof rows[1][5]).toBe('number')
})

test('판관비 업로드 양식 — 받아지고, 그대로 올리면 읽힌다', async ({ page }) => {
  await login(page)
  await page.goto('/expenses/upload')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '양식 다운로드' }).click()])
  expect(dl.suggestedFilename()).toBe('expense-upload-template.xlsx')
  const file = (await dl.path())!
  const wb = XLSX.read(readFileSync(file))
  const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  expect(grid.some((r) => r.includes('지출일') && r.includes('합계'))).toBe(true)
  // 받은 양식을 그대로 올리면 미리보기가 나온다 (저장은 안 함)
  await page.locator('#upload-file').setInputFiles({ name: dl.suggestedFilename(), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync(file) })
  await expect(page.getByTestId('upload-summary')).toContainText('읽은 행 2건')
})

test('판관비 — 좁히지 않아도 엑셀 앞부분이 화면 100건과 같은 순서', async ({ page }) => {
  await login(page)
  await page.goto('/expenses')
  const screen = await page.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].slice(1, 3).map((td) => (td as HTMLElement).innerText.trim()).join('|')))
  test.skip(screen.length < 2, '판관비 데이터 없음')
  const { rows } = await download(page, () => page.getByRole('button', { name: '엑셀 내보내기' }).click())
  expect(rows.slice(1, screen.length + 1).map((r) => `${r[0]}|${r[1] || '-'}`)).toEqual(screen)
})
