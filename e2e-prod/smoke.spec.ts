import { test, expect, type Page } from '@playwright/test'

/** 운영 점검 — 화면을 열고 누르기만 한다. 저장·삭제·내보내기 버튼은 누르지 않는다 */
async function login(page: Page) {
  const email = process.env.PROD_QA_EMAIL
  const password = process.env.PROD_QA_PASSWORD
  if (!email || !password) throw new Error('PROD_QA_EMAIL / PROD_QA_PASSWORD 가 없습니다 (_docs/qa-account.env)')
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
async function openDeals(page: Page, query = '') {
  await page.goto(`/deals${query}`)
  await page.locator('[data-bulk-ready]').waitFor({ timeout: 30_000 })
  const btn = page.locator('[data-overdue-dialog]').getByRole('button', { name: '확인' })
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) await btn.click()
}
async function switchTo(page: Page, entity: 'kr' | 'us') {
  await page.getByLabel('법인 선택').selectOption(entity)
  await expect(page.locator('[data-slot=entity-switcher]')).toHaveAttribute('data-entity', entity)
  await page.waitForLoadState('networkidle')
}
const headers = async (page: Page) =>
  (await page.locator('[data-slot=deals-scroll] thead tr').first().locator('th').allInnerTexts()).map((h) => h.replace(/\s+/g, ''))

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('거래 — 요약 카드 5개(인센티브 합계 포함), 목록과 수정 표시', async ({ page }) => {
  await openDeals(page)
  const cards = await page.locator('[data-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')))
  expect(cards).toEqual(['매출 합계', '매입 합계', '손익', '인센티브 합계', '미입금'])
  await expect(page.locator('[data-slot=deals-scroll] tbody tr').first()).toBeVisible()
  // 수정완료는 글씨 없는 상자
  const done = page.locator('[data-review=done]')
  if (await done.count()) await expect(done.first()).toHaveText('')
  // 조회 전용 계정은 표시를 바꿀 수 없다
  await expect(page.locator('[data-review]').first()).toBeDisabled()
})

test('매출목표 — 달성치·수익 근거 합계가 표의 값과 같다', async ({ page }) => {
  await page.goto('/reports/plan')
  const dialog = page.locator('[data-drill-dialog]')
  for (const key of ['plan_sales_all', 'plan_profit_all']) {
    await page.locator(`[data-drill="${key}"]`).click()
    await expect(dialog.locator('[data-slot=drill-check]')).toHaveAttribute('data-ok', 'true')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
})

test('매출장표 — 근거 합계가 표의 값과 같다', async ({ page }) => {
  await page.goto('/reports/ledger')
  await page.locator('tr[data-row="sales_accrual"] [data-drill]').first().click()
  await expect(page.locator('[data-drill-dialog] [data-slot=drill-check]')).toHaveAttribute('data-ok', 'true')
})

test('미국법인 — 부가세·계산서 열 없이 손익(KRW)', async ({ page }) => {
  await page.goto('/')
  await switchTo(page, 'us')
  try {
    await openDeals(page, '?year=all')
    const hs = await headers(page)
    expect(hs).not.toContain('부가세')
    expect(hs.some((h) => h.includes('계산서'))).toBe(false)
    expect(hs).toContain('손익(KRW)')
  } finally {
    await switchTo(page, 'kr')
  }
})

test('권한 — 인사관리·수정요청 집계에 들어갈 수 없다', async ({ page }) => {
  for (const path of ['/hr', '/review-requests']) {
    await page.goto(path)
    await expect(page).not.toHaveURL(new RegExp(path))
  }
})

test('성과급 보정(2026-10-14) — 성과금만 있던 행이 빈 거래로 남아 있지 않다', async ({ page }) => {
  await openDeals(page, '?fCode=AZ260318&year=all')
  const codes = await page.locator('[data-slot=deals-scroll] tbody tr td:first-child a').allInnerTexts()
  expect(codes).toEqual(['AZ260318'])
})

test('판관비 업로드 양식(2026-10-21) — 배포에 포함돼 받아진다', async ({ page }) => {
  // 파일만 받아 본다 (화면 이동·저장 없음). .vercelignore 가 xlsx 를 빼서 404 였던 사고 재발 방지
  const res = await page.request.get('/templates/expense-upload-template.xlsx', { maxRedirects: 0 })
  expect(res.status()).toBe(200)
  expect((await res.body()).subarray(0, 2).toString()).toBe('PK')
})

test('띄어쓰기 무시 검색(2026-10-21) — 붙여 쓴 검색어로 띄어 쓴 거래처를 찾는다', async ({ page }) => {
  await page.goto(`/counterparties?q=${encodeURIComponent('매출처없음')}`)
  await expect(page.locator('tbody tr', { hasText: '(매출처 없음)' })).toHaveCount(1)
})

test('판관비 금액 검색(2026-10-27) — 첫 행 금액으로 찾으면 같은 금액만 나온다 (읽기만)', async ({ page }) => {
  await page.goto('/expenses')
  const amount = (await page.locator('tbody tr').first().locator('td').nth(6).innerText()).trim()
  await page.goto(`/expenses?q=${encodeURIComponent(amount)}`)
  const amounts = (await page.locator('tbody tr td:nth-child(7)').allInnerTexts()).map((t) => t.trim())
  expect(amounts.length).toBeGreaterThan(0)
  for (const a of amounts) expect(a).toBe(amount)
})

test('보증금 한 표(2026-10-23) — 탭 없이 한 표, 처음엔 반환완료 없음', async ({ page }) => {
  await page.goto('/deposits')
  await expect(page.getByRole('tablist')).toHaveCount(0)
  await expect(page.locator('tbody tr[data-kind]').first()).toBeVisible()
  const statuses = (await page.locator('tbody tr[data-kind] td[data-col=status]').allInnerTexts()).map((t) => t.trim())
  expect(statuses).not.toContain('반환완료')
  await expect(page.getByRole('button', { name: '상태 골라 보기' })).toBeVisible()
  // 2026-10-27: 전속계약도 상태가 보인다 (0026 적용 확인)
  await expect(page.locator('tbody tr[data-kind=exclusive] td[data-col=status]').first()).toHaveText(/계약중|계약종료/)
  // 구분 제목으로 전속계약만 골라 보면 상태 메뉴엔 계약 상태만 (화면 안에서만 거름, 저장 없음)
  await page.getByRole('button', { name: '구분 골라 보기' }).click()
  const kindMenu = page.locator('[data-slot=deposit-kind-filter]')
  await kindMenu.getByRole('menuitemcheckbox', { name: /^보증금/ }).click()
  await page.keyboard.press('Escape')
  for (const k of await page.locator('tbody tr[data-kind]').evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-kind')))) expect(k).toBe('exclusive')
  await page.getByRole('button', { name: '상태 골라 보기' }).click()
  await expect(page.locator('[data-slot=deposit-status-filter]').getByRole('menuitemcheckbox')).toHaveCount(2)
})

test('거래 금액 칸 합계(2026-10-23) — Ctrl+클릭한 두 칸의 합계가 보인다 (읽기만)', async ({ page }) => {
  await openDeals(page)
  const cells = page.locator('[data-slot=deals-scroll] tbody tr[data-row-id] td[data-sum=salesGross][data-num]')
  const nums = await Promise.all([0, 1].map(async (i) => Number(await cells.nth(i).getAttribute('data-num'))))
  for (const i of [0, 1]) await cells.nth(i).click({ modifiers: ['ControlOrMeta'] })
  const bar = page.locator('[data-slot=cell-sum]')
  await expect(bar).toContainText('개수: 2')
  await expect(bar.locator('[data-slot=cell-sum-total]')).toHaveText((nums[0] + nums[1]).toLocaleString('ko-KR'))
})

test('결산연월일 검색(2026-10-28) — 202610 으로 찾으면 화면 결산연월일이 모두 2026-10 (읽기만)', async ({ page }) => {
  await openDeals(page, '?year=all&fPurchaseDue=202610')
  const values = await page.locator('[data-slot=deals-scroll] table').evaluate((table) => {
    const heads = [...table.querySelectorAll('thead tr:first-child th')]
    const i = heads.findIndex((th) => th.textContent?.startsWith('결산연월일'))
    return [...table.querySelectorAll('tbody tr[data-row-id]')].map((tr) => (tr.children[i]?.querySelector('div > div')?.textContent ?? '').trim())
  })
  expect(values.length).toBeGreaterThan(0)
  for (const v of values) expect(v).toMatch(/^2026-10/)
})

test('보증금 상태 넷·보유자산 없음·칸 제목(2026-10-28), 담당자 이름 김도형 (읽기만)', async ({ page }) => {
  await page.goto('/deposits')
  await expect(page.getByRole('columnheader', { name: '거래처(매체명)' })).toBeVisible()
  await expect(page.locator('tbody tr[data-kind=asset]')).toHaveCount(0)
  await page.getByRole('button', { name: '상태 골라 보기' }).click()
  const names = (await page.locator('[data-slot=deposit-status-filter]').getByRole('menuitemcheckbox').allInnerTexts()).map((t) => t.replace(/\d+/g, '').trim())
  expect(names).toEqual(['보유', '계약중', '반환완료', '계약종료'])
  await page.keyboard.press('Escape')
  await openDeals(page)
  await page.getByRole('button', { name: /담당자/ }).first().click()
  await expect(page.getByText('김도형', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('김도형(AH)')).toHaveCount(0)
})
