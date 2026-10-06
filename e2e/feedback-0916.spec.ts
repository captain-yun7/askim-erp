import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-09-16 고객 수정 요청 통합본 11건 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const LEAD = { email: 'lead.e2e@askim.local', password: PW }
const MEMBER = { email: 'member.e2e@askim.local', password: PW }
const OTHER = { email: 'other.e2e@askim.local', password: PW }

async function login(page: Page, who: { email: string; password: string }) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}

const codes = (page: Page) => page.locator('[data-slot=deals-scroll] tbody tr td:first-child a').allInnerTexts()

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('① 기부금 — 월을 클릭해야 상세가 펼쳐진다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/reports/donations?year=2026')
  await expect(page.locator('[data-slot=donation-detail]')).toHaveCount(0)
  const month = page.locator('tr[aria-expanded]').first()
  await month.click()
  await expect(month).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-slot=donation-detail]')).toHaveCount(1)
  await expect(page.locator('[data-slot=donation-detail] tbody tr').first()).toBeVisible()
  await month.click()
  await expect(page.locator('[data-slot=donation-detail]')).toHaveCount(0)
  await page.getByRole('button', { name: '모두 펼치기' }).click()
  expect(await page.locator('[data-slot=donation-detail]').count()).toBeGreaterThan(1)
})

test('② 권한 — 팀장 조회 범위를 관리자가 전체/자기 팀으로 설정', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')
  await page.getByRole('radio', { name: /자기 팀만/ }).click()
  await expect(page.getByRole('radio', { name: /자기 팀만/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText("팀장 조회 범위가 '자기 팀만'")).toBeVisible()

  await login(page, LEAD)
  await page.goto('/deals?q=E2E거래0916')
  let list = await codes(page)
  expect(list).toEqual(expect.arrayContaining(['E2E0916-LEAD', 'E2E0916-MEMBER']))
  expect(list).not.toContain('E2E0916-OTHER')
  // 팀장은 팀원 거래를 볼 수만 있다 — 상세는 읽기 전용
  await page.locator('a', { hasText: 'E2E0916-MEMBER' }).click()
  await expect(page.getByText('읽기 전용')).toBeVisible()

  await login(page, ADMIN)
  await page.goto('/admin')
  await page.getByRole('radio', { name: /^전체/ }).click()
  await expect(page.getByText("팀장 조회 범위가 '전체'")).toBeVisible()

  await login(page, LEAD)
  await page.goto('/deals?q=E2E거래0916')
  list = await codes(page)
  expect(list).toEqual(expect.arrayContaining(['E2E0916-LEAD', 'E2E0916-MEMBER', 'E2E0916-OTHER', 'E2E0916-THIRD']))

  // 팀원은 설정과 무관하게 본인 것만
  await login(page, MEMBER)
  await page.goto('/deals?q=E2E거래0916')
  expect(await codes(page)).toEqual(['E2E0916-MEMBER'])
})

test('②-2 함께 보는 팀 묶음 — 묶인 두 팀은 팀장이 아니어도 서로 조회·수정, 다른 팀은 그대로', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')
  const card = page.locator('[data-slot=team-share-groups]')
  // 하이드레이션 전 클릭은 무시되므로 묶음 행이 생길 때까지 재시도
  await expect(async () => {
    if ((await card.locator('[data-slot=team-share-group]').count()) === 0) await card.getByRole('button', { name: '묶음 추가' }).click()
    await expect(card.locator('[data-slot=team-share-group]')).toHaveCount(1, { timeout: 1500 })
  }).toPass()
  // 체크박스의 접근성 이름은 감싼 label 글자(팀 이름)
  await card.getByRole('checkbox', { name: 'E2E팀', exact: true }).click()
  await card.getByRole('checkbox', { name: 'E2E타팀', exact: true }).click()
  await card.getByRole('button', { name: '묶음 적용' }).click()
  await expect(page.getByText('팀 묶음 1개를 저장했습니다')).toBeVisible()
  await page.reload()
  await expect(card.locator('[data-slot=team-share-group]')).toContainText('E2E팀 · E2E타팀')

  // 팀원(E2E팀): 같은 팀 + 묶인 타팀은 보이고, 제3팀은 안 보임
  await login(page, MEMBER)
  await page.goto('/deals?q=E2E거래0916')
  const list = await codes(page)
  expect(list).toEqual(expect.arrayContaining(['E2E0916-LEAD', 'E2E0916-MEMBER', 'E2E0916-OTHER']))
  expect(list).not.toContain('E2E0916-THIRD')

  // 상대 팀 거래를 목록에서 바로 수정
  await page.goto('/deals?fCode=E2E0916-OTHER')
  const row = page.locator('[data-slot=deals-scroll] tbody tr').first()
  await row.locator('td:nth-child(9) button').click()
  await row.locator('td:nth-child(9) input').fill('2345000')
  await row.locator('td:nth-child(9) input').press('Enter')
  await expect(row.locator('td:nth-child(9)')).toHaveText(/2,345,000/)
  // 상세 화면도 수정 가능(읽기 전용 아님) — 저장까지
  await row.locator('td:first-child a').click()
  await expect(page.getByText('읽기 전용')).toHaveCount(0)
  await page.locator('div:has(> label:text-is("매출 비고")) textarea').fill('묶음 팀원이 수정')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')

  // 반대 방향(E2E타팀 → E2E팀)도 동일, 담당자는 바뀌지 않음
  await login(page, OTHER)
  await page.goto('/deals?q=E2E거래0916')
  const otherList = await codes(page)
  expect(otherList).toEqual(expect.arrayContaining(['E2E0916-LEAD', 'E2E0916-MEMBER', 'E2E0916-OTHER']))
  expect(otherList).not.toContain('E2E0916-THIRD')
  await page.goto('/deals?fCode=E2E0916-OTHER')
  await expect(page.locator('[data-slot=deals-scroll] tbody tr').first().locator('td:nth-child(5)')).toContainText('E2E타팀')
  await expect(page.locator('[data-slot=deals-scroll] tbody tr').first().locator('td:nth-child(9)')).toHaveText(/2,345,000/)

  // 묶음에 없는 제3팀은 본인 것만, 남의 거래 상세는 열리지 않음
  await login(page, { email: 'third.e2e@askim.local', password: PW })
  await page.goto('/deals?q=E2E거래0916')
  expect(await codes(page)).toEqual(['E2E0916-THIRD'])

  // 묶음 해제 → 다시 본인 것만, 수정 불가
  await login(page, ADMIN)
  await page.goto('/admin')
  await card.getByLabel('묶음 1 삭제').click()
  await card.getByRole('button', { name: '묶음 적용' }).click()
  await expect(page.getByText('팀 묶음을 모두 해제했습니다')).toBeVisible()
  await login(page, MEMBER)
  await page.goto('/deals?q=E2E거래0916')
  expect(await codes(page)).toEqual(['E2E0916-MEMBER'])
})

test('③ 거래 — 두 줄 헤더 컬럼은 필터도 두 칸 (입금예정/입금일)', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  for (const p of ['fSalesDue', 'fSalesPaid', 'fPurchaseDue', 'fPurchasePaid']) await expect(page.getByLabel(`${p} 검색`)).toBeVisible()
  await page.getByLabel('fSalesPaid 검색').fill('2026-06')
  await page.getByLabel('fSalesPaid 검색').press('Enter')
  await page.waitForURL((u) => u.searchParams.get('fSalesPaid') === '2026-06')
  const cells = await page.locator('[data-slot=deals-scroll] tbody tr td:nth-child(18)').allInnerTexts()
  expect(cells.length).toBeGreaterThan(0)
  // 둘째 줄(입금일)이 모두 2026-06
  for (const c of cells) expect(c.trim().split('\n').pop()).toMatch(/^2026-06-/)

  // 입금예정일만 따로
  await page.goto('/deals?fSalesDue=2026-07')
  const due = await page.locator('[data-slot=deals-scroll] tbody tr td:nth-child(18)').allInnerTexts()
  expect(due.length).toBeGreaterThan(0)
  for (const c of due) expect(c.trim().split('\n')[0]).toMatch(/^2026-07-/)
})

test('④ 이메일 — 담당자 클릭 시 네이버웍스 메일 쓰기 창', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?q=E2E거래0916-팀원')
  const link = page.locator('a[data-owner-mail]').first()
  const href = (await link.getAttribute('href'))!
  expect(href.startsWith('https://mail.worksmobile.com/write/popup?')).toBe(true)
  const q = new URL(href).searchParams
  expect(q.get('to')).toBe(MEMBER.email)
  expect(q.get('subject')).toContain('E2E0916-MEMBER')
  expect(q.get('body')).toContain('거래코드: E2E0916-MEMBER')
  await expect(link).toHaveAttribute('target', '_blank')
})

test('⑤ 거래 필터 — 귀속연도 다중 선택', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  await page.getByLabel('귀속연도 필터').click()
  await page.getByText('2024', { exact: true }).click()
  await page.waitForURL((u) => u.searchParams.get('year') === '2024')
  await page.getByText('2025', { exact: true }).click()
  await page.waitForURL((u) => u.searchParams.get('year') === '2024,2025')
  const accrual = await page.locator('[data-slot=deals-scroll] tbody tr td:nth-child(3)').allInnerTexts()
  expect(accrual.length).toBeGreaterThan(0)
  const years = new Set(accrual.map((t) => t.trim().split('/')[0]))
  expect([...years].sort()).toEqual(['24', '25'])
})

test('⑥ 거래입력 — (회계팀 입력) 빨간 표시와 필수 표시', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals/new')
  for (const name of ['지급일', '매입 세계발행일', '결산여부']) {
    const label = page.locator('label', { hasText: name })
    await expect(label).toContainText('(회계팀 입력)')
    const color = await label.locator('span').evaluate((el) => getComputedStyle(el).color)
    expect(color).not.toBe(await page.locator('label', { hasText: '품목명' }).evaluate((el) => getComputedStyle(el).color))
  }
  const labels = page.locator('form label, fieldset label, label[data-slot=label]')
  const total = await labels.count()
  const required = await page.locator('label[data-required]').count()
  expect(total - required).toBe(2) // 매출 비고 · 매입 비고만 제외
  for (const name of ['매출 비고', '매입 비고']) await expect(page.locator('label', { hasText: name })).not.toHaveAttribute('data-required', '')
  const star = await page.locator('label', { hasText: '품목명' }).evaluate((el) => getComputedStyle(el, '::after').content)
  expect(star).toContain('*')
})

test('⑦ 거래처 — 상세 상단 삭제 버튼 + 목록 체크박스 다건 삭제', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/counterparties?q=E2E거래처0916')
  await expect(page.locator('tbody tr')).toHaveCount(3)

  // 상세: 상단에서 바로 삭제
  await page.getByRole('link', { name: 'E2E거래처0916-단건' }).click()
  const top = page.getByRole('button', { name: '거래처 삭제' }).first()
  await expect(top).toBeVisible()
  expect((await top.boundingBox())!.y).toBeLessThan(400)
  page.once('dialog', (d) => d.accept())
  await top.click()
  await page.waitForURL((u) => u.pathname === '/counterparties')

  // 목록: 체크박스로 여러 건
  await page.goto('/counterparties?q=E2E거래처0916')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByLabel('전체 선택').click()
  await expect(page.locator('[data-slot=bulk-bar]')).toContainText('2건 선택')
  page.once('dialog', (d) => {
    expect(d.message()).toContain('거래처 2건')
    d.accept()
  })
  await page.getByRole('button', { name: '선택 삭제' }).click()
  await expect(page.getByText('거래처 2건을 삭제했습니다')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('⑧ 복사 — 목록에서 거래 복사, 거래코드는 새로 입력', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?q=E2E거래0916-팀장')
  await page.getByLabel('E2E0916-LEAD 복사').click()
  await page.waitForURL((u) => u.pathname === '/deals/new' && u.searchParams.has('copy'))
  await expect(page.locator('[data-slot=copy-banner]')).toContainText('E2E0916-LEAD')
  await expect(page.locator('div:has(> label:text-is("품목명")) input')).toHaveValue('E2E거래0916-팀장')
  await expect(page.locator('div:has(> label:text-is("거래코드")) input')).toHaveValue('')
  await expect(page.locator('div:has(> label:has-text("매출금")) input').first()).toHaveValue('1,000,000')
  // 복사본은 코드를 새로 입력해야 저장된다 (2026-09-17: 자동 채번 폐지)
  await page.getByRole('button', { name: '확정저장' }).click()
  await expect(page.getByText('거래코드를 입력하세요')).toBeVisible()
  await page.locator('div:has(> label:text-is("거래코드")) input').fill('E2E0916-LEAD-COPY')
  await page.getByRole('button', { name: '확정저장' }).click()
  await page.waitForURL((u) => u.pathname === '/deals')
  await page.goto('/deals?q=E2E거래0916-팀장')
  const list = await codes(page)
  expect(list).toHaveLength(2)
  expect(new Set(list).size).toBe(2)
  expect(list).toContain('E2E0916-LEAD')
})

test('⑨ 상단 고정 — 표만 스크롤되고 검색·필터·요약·헤더는 그대로', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals')
  const box = page.locator('[data-slot=deals-scroll]')
  const search = page.getByPlaceholder('거래코드, 거래처, 품목 검색...')
  const head = box.locator('thead')
  await box.hover()
  await page.mouse.wheel(0, 2500)
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000)
  // 페이지 자체는 스크롤되지 않고, 헤더는 상자 맨 위에 붙어 있음
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  const [b, h] = [await box.boundingBox(), await head.boundingBox()]
  expect(Math.abs(h!.y - b!.y)).toBeLessThanOrEqual(1)
  await expect(search).toBeInViewport()
  await expect(page.getByText('총', { exact: false }).first()).toBeInViewport()
  await expect(page.getByLabel('fCode 검색')).toBeInViewport()
  // 요약 카드는 접혀 표에 자리를 내줌, 맨 위로 올리면 다시 펼침
  await expect(page.locator('[data-slot=deals-summary]')).toHaveAttribute('data-collapsed', 'true')
  await box.evaluate((el) => el.scrollTo({ top: 0 }))
  await expect(page.locator('[data-slot=deals-summary]')).not.toHaveAttribute('data-collapsed', 'true')
  // 가로 스크롤바도 상자(=화면) 안
  expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  expect(b!.y + b!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
})

test('⑩ 정렬 — 거래코드 뒤 번호를 숫자로', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/deals?fCode=E2ESORT&sort=code&dir=asc')
  expect(await codes(page)).toEqual(['E2ESORT', 'E2ESORT-1', 'E2ESORT-2', 'E2ESORT-10', 'E2ESORT-11'])
  await page.goto('/deals?fCode=E2ESORT&sort=code')
  expect(await codes(page)).toEqual(['E2ESORT-11', 'E2ESORT-10', 'E2ESORT-2', 'E2ESORT-1', 'E2ESORT'])
})

test('⑪ 오류 — 글자 크기를 키워도 프로필 메뉴가 화면 안에 뜬다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/profile')
  await page.getByRole('radio', { name: '더 크게', exact: true }).click()
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('ui-root')!).zoom)).toBe('1.2')
  try {
    for (const path of ['/deals', '/expenses']) {
      await page.goto(path)
      const trigger = page.locator('aside button').last()
      await expect(trigger).toBeInViewport()
      await trigger.click()
      const item = page.getByRole('menuitem', { name: '로그아웃' })
      await expect(item).toBeInViewport({ ratio: 1 })
      const [t, m] = [await trigger.boundingBox(), await item.boundingBox()]
      expect(m!.y + m!.height).toBeLessThanOrEqual(t!.y + 2) // 버튼 바로 위
      expect(Math.abs(m!.x - t!.x)).toBeLessThan(60)
      await page.keyboard.press('Escape')
    }
  } finally {
    await page.goto('/profile')
    await page.getByRole('radio', { name: '기본', exact: true }).click()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('ui-root')!).zoom)).toBe('1')
  }
})
