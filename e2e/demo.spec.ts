import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const SALES = { email: 'kim.hj@askim.local', password: 'askim2026!' }

const STAMP = Date.now()
const DEAL_ITEM = `E2E거래${STAMP}`
const EXP_ITEM = `E2E지출${STAMP}`

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

test.afterAll(() => {
  // E2E로 생성한 거래/판관비 정리
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test.describe.serial('관리자 핵심 쓰기 플로우', () => {
  test('① 로그인 → 대시보드 진입', async ({ page }) => {
    await login(page, ADMIN)
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  })

  test('② 거래 등록 → 목록에 반영 + 손익 자동계산', async ({ page }) => {
    await login(page, ADMIN)
    await page.goto('/deals/new')

    await page.locator('div:has(> label:text-is("품목명")) input').fill(DEAL_ITEM)
    await page.locator('div:has(> label:has-text("매출금")) input').first().fill('1000000')
    await page.locator('div:has(> label:has-text("매입금")) input').first().fill('700000')

    // 자동계산 손익 표시 확인 (1,000,000 - 700,000 = 300,000)
    await expect(page.getByText('300,000').first()).toBeVisible()

    await page.getByRole('button', { name: '확정저장' }).click()
    await page.waitForURL((u) => u.pathname === '/deals')

    // 목록 검색으로 반영 확인 (품목명은 고유 마커 → 정확히 1행)
    await page.goto(`/deals?q=${encodeURIComponent(DEAL_ITEM)}`)
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })

  test('③ 판관비 일괄 입력 → 목록 반영', async ({ page }) => {
    await login(page, ADMIN)
    await page.goto('/expenses/new')

    const firstRow = page.locator('tbody tr').first()
    await firstRow.locator('input[placeholder="품목명"]').fill(EXP_ITEM)
    await firstRow.locator('input[inputmode="numeric"]').fill('33000')

    await page.getByRole('button', { name: '일괄저장' }).click()
    await page.waitForURL((u) => u.pathname === '/expenses')
    await expect(page.getByText(EXP_ITEM)).toBeVisible()
  })

  test('④ 거래 목록 CSV 다운로드 → BOM + 헤더 검증', async ({ page }) => {
    await login(page, ADMIN)
    await page.goto('/deals')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV 내보내기' }).click(),
    ])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(c as Buffer)
    const text = Buffer.concat(chunks).toString('utf-8')
    expect(text.charCodeAt(0)).toBe(0xfeff) // UTF-8 BOM
    expect(text).toContain('거래코드')
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })

  test('⑤ Lookup 마스터 수정 → 저장 성공 (메모 변경 후 원복)', async ({ page }) => {
    await login(page, ADMIN)
    await page.goto('/admin/lookups')

    // 상품구분(첫 테이블) 첫 행: 입력 [명칭, 요율, 순서, 메모]
    const row = page.locator('table').first().locator('tbody tr').first()
    const memo = row.locator('input').nth(3)
    const original = await memo.inputValue()

    await memo.fill(`E2E_${STAMP}`)
    await row.getByRole('button', { name: '저장' }).click()
    await expect(page.getByText('저장되었습니다')).toBeVisible()

    // 원복
    await page.reload()
    const row2 = page.locator('table').first().locator('tbody tr').first()
    await row2.locator('input').nth(3).fill(original)
    await row2.getByRole('button', { name: '저장' }).click()
    await expect(page.getByText('저장되었습니다')).toBeVisible()
  })
})

test.describe('영업 권한 차단', () => {
  test('⑥ 영업은 /admin 접근 시 홈으로 차단 + 관리 메뉴 미노출', async ({ page }) => {
    await login(page, SALES)
    await page.goto('/admin')
    await page.waitForURL('http://localhost:3300/')
    // 사이드바에 관리(사용자·설정) 메뉴 없음
    await expect(page.getByText('사용자·설정')).toHaveCount(0)
    // 거래 메뉴는 접근 가능
    await page.goto('/deals')
    await expect(page).toHaveURL(/\/deals/)
  })
})
