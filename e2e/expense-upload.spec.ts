import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'

/** 판관비 엑셀 업로드 (2026-09-09 피드백) — 미리보기(매칭·중복·오류) → 등록 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const FIXTURE = process.env.E2E_UPLOAD_XLSX ?? path.resolve('e2e/fixtures/expense-upload.xlsx')

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

test('엑셀 업로드: 미리보기 → 미매칭 지정 → 등록 → 목록 반영, 재업로드 시 전부 중복', async ({ page }) => {
  await login(page)
  await page.goto('/expenses/upload')
  await page.locator('#upload-file').setInputFiles(FIXTURE)

  // 5행 중 날짜 없는 1행은 오류, 4행 읽힘, 그중 1행은 파일 내 중복, 1행은 항목 미매칭
  const summary = page.getByTestId('upload-summary')
  await expect(summary).toContainText('읽은 행 4건')
  await expect(summary).toContainText('건너뛴 행 1건')
  await expect(summary).toContainText('항목 미매칭 1건')
  await expect(summary).toContainText('중복 1건')
  await expect(page.getByRole('button', { name: /3건 등록/ })).toBeVisible()

  // 미매칭 행에 항목 수동 지정
  await page.getByLabel('6행 항목').selectOption({ label: '식대비' })
  await expect(summary).toContainText('항목 미매칭 0건')

  await page.getByRole('button', { name: /3건 등록/ }).click()
  await page.waitForURL((u) => u.pathname === '/expenses')
  await page.goto('/expenses?q=E2E업로드')
  await expect(page.locator('tbody tr')).toHaveCount(3)

  // 같은 파일 다시 올리면 전부 중복 → 등록 버튼 비활성
  await page.goto('/expenses/upload')
  await page.locator('#upload-file').setInputFiles(FIXTURE)
  await expect(page.getByTestId('upload-summary')).toContainText('중복 4건')
  await expect(page.getByRole('button', { name: /0건 등록/ })).toBeDisabled()
})
