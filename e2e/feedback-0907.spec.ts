import { test, expect, type Page } from '@playwright/test'

/**
 * 고객 피드백 2026-09-07 (erp개발 수정요청사항_2026.09.07.xlsx)
 * ① 거래 목록 컬럼별 검색을 금액·상태·날짜 컬럼까지 확장
 * ② 거래 목록 화면 하단 고정 가로 스크롤바
 * ③ 매출장표 '(매출원가)_통장' 행을 총매출(귀속월) 아래로 이동
 */

const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

const cellTexts = (page: Page, nth: number) =>
  page.locator(`tbody tr td:nth-child(${nth})`).allInnerTexts()

const toNum = (s: string) => Number(s.replace(/[^\d-]/g, ''))

test.describe('① 거래 목록 컬럼별 검색 (금액·상태·날짜)', () => {
  test('손익 <0 → URL 반영 + 모든 행 음수', async ({ page }) => {
    await login(page)
    await page.goto('/deals?year=2026')
    await page.getByLabel('fProfit 검색').fill('<0')
    await page.getByLabel('fProfit 검색').press('Enter')
    await page.waitForURL((u) => u.searchParams.get('fProfit') === '<0')

    const profits = await cellTexts(page, 11)
    expect(profits.length).toBeGreaterThan(0)
    for (const p of profits) expect(toNum(p)).toBeLessThan(0)
    // 새로고침 후에도 입력값 유지
    await expect(page.getByLabel('fProfit 검색')).toHaveValue('<0')
  })

  test('매출 범위 100000~1000000 → 모든 행 구간 안', async ({ page }) => {
    await login(page)
    await page.goto('/deals?year=2026')
    await page.getByLabel('fSales 검색').fill('100000~1000000')
    await page.getByLabel('fSales 검색').press('Enter')
    await page.waitForURL((u) => u.searchParams.has('fSales'))

    const sales = await cellTexts(page, 7)
    expect(sales.length).toBeGreaterThan(0)
    for (const s of sales) {
      const v = toNum(s)
      expect(v).toBeGreaterThanOrEqual(100000)
      expect(v).toBeLessThanOrEqual(1000000)
    }
  })

  test('입금/결산 셀렉트 → 즉시 적용, 모든 행 미입금+결산', async ({ page }) => {
    await login(page)
    await page.goto('/deals?year=2026')
    await page.getByLabel('fPaid 검색').selectOption('unpaid')
    await page.waitForURL((u) => u.searchParams.get('fPaid') === 'unpaid')
    await page.getByLabel('fSettled 검색').selectOption('settled')
    await page.waitForURL((u) => u.searchParams.get('fSettled') === 'settled')

    const status = await cellTexts(page, 12)
    expect(status.length).toBeGreaterThan(0)
    for (const s of status) {
      expect(s).toContain('미입금')
      expect(s).not.toContain('미결산')
      expect(s).toContain('결산')
    }
  })

  test('매출계산서 발행일 2026-06 → 모든 행 6월', async ({ page }) => {
    await login(page)
    await page.goto('/deals')
    await page.getByLabel('fSalesInvoice 검색').fill('2026-06')
    await page.getByLabel('fSalesInvoice 검색').press('Enter')
    await page.waitForURL((u) => u.searchParams.get('fSalesInvoice') === '2026-06')

    const dates = await cellTexts(page, 13)
    expect(dates.length).toBeGreaterThan(0)
    for (const d of dates) expect(d.trim()).toMatch(/^2026-06-\d{2}$/)
  })

  test('필터 비우고 Enter → 파라미터 해제', async ({ page }) => {
    await login(page)
    await page.goto('/deals?year=2026&fProfit=%3C0')
    await page.getByLabel('fProfit 검색').fill('')
    await page.getByLabel('fProfit 검색').press('Enter')
    await page.waitForURL((u) => !u.searchParams.has('fProfit') && u.searchParams.get('year') === '2026')
  })
})

test.describe('② 거래 목록 가로 스크롤', () => {
  test('화면 하단 고정 스크롤바가 보이고 표와 동기화된다', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 })
    await login(page)
    await page.goto('/deals?year=2026')

    const bar = page.locator('[data-slot=sticky-h-scroll-bar]')
    const content = page.locator('[data-slot=sticky-h-scroll-content]')
    await expect(bar).toBeVisible()
    // 하이드레이션 후 실측이 끝나야 스페이서 폭이 잡힘
    await expect.poll(() => bar.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)

    // 표 중간까지 세로 스크롤해도 스크롤바는 viewport 하단에 붙어 있어야 함 (sticky)
    await page.evaluate(() => window.scrollTo(0, 600))
    const box = await bar.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(700 + 1)
    expect(box!.y).toBeGreaterThan(700 - 40)

    // 스크롤바 → 표 동기화
    await bar.evaluate((el) => {
      el.scrollLeft = 300
      el.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(() => content.evaluate((el) => el.scrollLeft)).toBe(300)

    // 표 → 스크롤바 동기화
    await content.evaluate((el) => {
      el.scrollLeft = 120
      el.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(() => bar.evaluate((el) => el.scrollLeft)).toBe(120)

    // 오른쪽 끝까지 스크롤하면 마지막 컬럼(결산예정일)이 화면 안에 들어옴
    await bar.evaluate((el) => {
      el.scrollLeft = el.scrollWidth
      el.dispatchEvent(new Event('scroll'))
    })
    const lastHead = page.locator('thead tr').first().locator('th').last()
    await expect.poll(async () => (await lastHead.boundingBox())!.x + (await lastHead.boundingBox())!.width).toBeLessThanOrEqual(1100)
  })
})

test.describe('③ 매출장표 행 순서', () => {
  test('(매출원가)_통장이 총매출(귀속월) 바로 아래', async ({ page }) => {
    await login(page)
    await page.goto('/reports/ledger?year=2026&half=h1')
    const labels = (await page.locator('tbody tr td:first-child').allInnerTexts()).map((s) => s.trim())
    expect(labels.slice(0, 6)).toEqual([
      '총매출(통장)',
      '총매출(귀속월)',
      '(매출원가)_통장',
      '(매출원가)_귀속월',
      '손익(통장)',
      '손익(귀속월)',
    ])
  })
})
