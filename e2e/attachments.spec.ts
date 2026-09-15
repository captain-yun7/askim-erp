import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'

/** 보증금 첨부파일 (2026-09-15) — 업로드 → 배지 → 뷰어 라우트 → 다운로드 → 삭제 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const PDF = path.resolve('e2e/fixtures/sample.pdf')

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('보증금 행에 PDF 첨부 → 새 탭 보기(inline) → 다운로드 → 삭제', async ({ page, context }) => {
  await login(page)
  await page.goto('/deposits')
  await page.getByRole('button', { name: '보증금 추가' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input').first().fill('E2E거래처첨부')
  await dialog.getByRole('button', { name: /저장|추가/ }).last().click()
  await expect(dialog).toBeHidden()

  const row = page.locator('tbody tr', { hasText: 'E2E거래처첨부' })
  await row.getByRole('button', { name: /첨부파일/ }).click()
  const att = page.getByRole('dialog')
  await att.locator('input[type=file]').setInputFiles(PDF)
  await expect(att.getByText('sample.pdf')).toBeVisible()

  // 인라인 뷰어 링크 (로그인 쿠키로 접근)
  const viewHref = await att.locator('a[title="새 탭에서 보기"]').getAttribute('href')
  const res = await context.request.get('http://localhost:3300' + viewHref!)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/pdf')
  expect(res.headers()['content-disposition']).toContain('inline')
  const dl = await context.request.get('http://localhost:3300' + viewHref! + '?download=1')
  expect(dl.headers()['content-disposition']).toContain('attachment')

  await att.getByRole('button', { name: '닫기' }).click()
  await page.reload()
  await expect(page.locator('tbody tr', { hasText: 'E2E거래처첨부' }).getByRole('button', { name: '첨부파일 1개' })).toBeVisible()

  await page.locator('tbody tr', { hasText: 'E2E거래처첨부' }).getByRole('button', { name: /첨부파일/ }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('dialog').getByTitle('삭제').click()
  await expect(page.getByRole('dialog').getByText('첨부된 파일이 없습니다')).toBeVisible()
  // 로그아웃 상태에서는 접근 불가
  const anon = await (await page.context().browser()!.newContext()).request.get('http://localhost:3300' + viewHref!, { maxRedirects: 0 })
  expect([302, 307, 401]).toContain(anon.status())
})

test('거래 목록 행에도 첨부 → 배지 → 삭제', async ({ page }) => {
  await login(page)
  await page.goto('/deals/new')
  await page.locator('div:has(> label:text-is("품목명")) input').fill('E2E거래첨부')
  await page.locator('div:has(> label:has-text("매출금")) input').first().fill('10000')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')
  await page.goto('/deals?q=E2E거래첨부')
  const row = page.locator('tbody tr').first()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await row.locator('td:nth-child(2)').getByRole('button', { name: /첨부파일/ }).click()
  const att = page.getByRole('dialog')
  await att.locator('input[type=file]').setInputFiles(PDF)
  await expect(att.getByText('sample.pdf')).toBeVisible()
  await att.getByRole('button', { name: '닫기' }).click()
  await page.reload()
  await expect(page.locator('tbody tr').first().getByRole('button', { name: '첨부파일 1개' })).toBeVisible()
  await page.locator('tbody tr').first().getByRole('button', { name: /첨부파일/ }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('dialog').getByTitle('삭제').click()
  await expect(page.getByRole('dialog').getByText('첨부된 파일이 없습니다')).toBeVisible()
})
