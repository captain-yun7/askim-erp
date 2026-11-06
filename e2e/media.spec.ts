import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-11-02 요청 — 매체관리 메뉴 (광고매체 엑셀 + 임대인 시트 정리 PDF 기준) */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const VIEWER = { email: 'viewer.e2e@askim.local', password: 'askim2026!' }
const NAME = 'E2E매체-성수빌딩'

async function login(page: Page, who = ADMIN) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const sqlRun = (q: string) =>
  execSync(`npx tsx -e "import('./scripts/_env').then(async()=>{const {db}=await import('@/lib/db/client');const {sql}=await import('drizzle-orm');const r=await db.execute(sql.raw(process.env.Q));console.log(JSON.stringify(r.rows??r));process.exit(0)})"`, { env: { ...process.env, Q: q } }).toString().trim().split('\n').pop()!

test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
  execSync('npx tsx scripts/e2e-fixture-media.ts', { stdio: 'inherit' })
  // 목록에 고를 지역·시공사가 있게 (엑셀 가져오기와 같은 모양)
  sqlRun(`insert into media_option (entity, kind, value, sort_order) values ('kr','vendor','E2E시공',99), ('kr','contract_type','E2E전속',99) on conflict do nothing`)
  sqlRun(`insert into media_option (entity, kind, value, sort_order) select 'kr','region','E2E시',99 where not exists (select 1 from media_option where value='E2E시')`)
  sqlRun(`insert into media_option (entity, kind, value, parent_id, sort_order) select 'kr','region','E2E구',id,99 from media_option where value='E2E시' and not exists (select 1 from media_option where value='E2E구')`)
  sqlRun(`insert into media_option (entity, kind, value, parent_id, sort_order) select 'kr','region','E2E동',id,99 from media_option where value='E2E구' and not exists (select 1 from media_option where value='E2E동')`)
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('메뉴 — 보증금·전속계약 바로 아래에 매체관리', async ({ page }) => {
  await login(page)
  const nav = await page.locator('aside nav a, aside a').allInnerTexts()
  const labels = nav.map((t) => t.trim()).filter(Boolean)
  expect(labels.indexOf('매체관리')).toBe(labels.indexOf('보증금·전속계약') + 1)
  await page.getByRole('link', { name: '매체관리' }).click()
  await expect(page.getByRole('heading', { name: '매체관리' })).toBeVisible()
})

test('새 매체 — 지역은 시→구→동네로 고르고, 가격·담당자는 줄마다, 끝난 계약은 만료, 번호는 M+연월+순번', async ({ page }) => {
  await login(page)
  await page.goto('/media/new')
  await page.getByLabel('매체명').fill(NAME)
  await page.getByLabel('시', { exact: true }).selectOption('E2E시')
  await page.getByLabel('구', { exact: true }).selectOption('E2E구')
  await page.getByLabel('동네', { exact: true }).selectOption('E2E동')
  await page.getByLabel('계약종류').selectOption('E2E전속')
  await page.getByLabel('계약 시작일').fill('2024-01-01')
  await page.getByLabel('계약 시작일').press('Enter')
  await page.getByLabel('계약 끝나는 날').fill('2025-12-31')
  await page.getByLabel('계약 끝나는 날').press('Enter')
  await expect(page.locator('[data-slot=media-expired]')).toBeVisible()

  // 입금가 두 줄 — 면마다
  const net = page.locator('[data-price-type=net]')
  await net.getByRole('button', { name: '줄 추가' }).click()
  await net.getByRole('button', { name: '줄 추가' }).click()
  const lines = net.locator('[data-slot=price-line]')
  await lines.nth(0).getByLabel('면·기간').fill('정면')
  await lines.nth(0).getByLabel('금액(만원)').fill('3,300')
  await lines.nth(1).getByLabel('면·기간').fill('정면+측면')
  await lines.nth(1).getByLabel('금액(만원)').fill('5200')
  await lines.nth(1).getByLabel('전후').check()

  // 담당자 두 명 — 번호는 010-0000-0000 으로 맞춰진다
  await page.getByRole('button', { name: '담당자 추가' }).click()
  await page.getByRole('button', { name: '담당자 추가' }).click()
  const cs = page.locator('[data-slot=contact-line]')
  await cs.nth(0).getByLabel('이름', { exact: true }).fill('배문경')
  await cs.nth(0).getByLabel('직함').fill('대표')
  await cs.nth(0).getByLabel('연락처', { exact: true }).fill('010 5237 2982')
  await cs.nth(1).getByLabel('이름', { exact: true }).fill('기예림')
  await cs.nth(1).getByLabel('연락처', { exact: true }).fill('01099991102')

  await page.locator('[data-slot=staff-picker]').getByRole('button', { name: '관리자', exact: true }).click()
  await page.getByRole('button', { name: '시공사 추가' }).click()
  await page.locator('[data-slot=vendor-line]').getByLabel('시공사', { exact: true }).selectOption('E2E시공')

  await page.getByRole('button', { name: '저장' }).click()
  await page.waitForURL((u) => u.pathname === '/media')

  const [row] = JSON.parse(sqlRun(`select id, code, region_city, region_district, region_area, contract_end from media where name='${NAME}' and deleted_at is null`))
  const ym = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(2, 7).replace('-', '')
  expect(row.code).toMatch(new RegExp(`^M${ym}\\d{4}$`))
  expect([row.region_city, row.region_district, row.region_area]).toEqual(['E2E시', 'E2E구', 'E2E동'])
  const prices = JSON.parse(sqlRun(`select label, amount::int as amount, approx from media_price where media_id=${row.id} order by sort_order`))
  expect(prices).toEqual([
    { label: '정면', amount: 33_000_000, approx: false },
    { label: '정면+측면', amount: 52_000_000, approx: true },
  ])
  const phones = JSON.parse(sqlRun(`select name, title, phone from media_contact where media_id=${row.id} order by sort_order`))
  expect(phones).toEqual([
    { name: '배문경', title: '대표', phone: '010-5237-2982' },
    { name: '기예림', title: null, phone: '010-9999-1102' },
  ])

  expect(JSON.parse(sqlRun(`select u.name from media_staff s join users u on u.id=s.user_id where s.media_id=${row.id}`))).toEqual([{ name: '관리자' }])
  expect(JSON.parse(sqlRun(`select name from media_vendor where media_id=${row.id}`))).toEqual([{ name: 'E2E시공' }])

  // 목록 — 연락처로 찾고, 만료 표시
  await page.getByPlaceholder(/매체명, 매체번호/).fill('9999-1102')
  const tr = page.locator(`tbody tr[data-media-code="${row.code}"]`)
  await expect(tr).toBeVisible()
  await expect(page.locator('tbody tr[data-media-code]')).toHaveCount(1)
  await expect(tr.locator('[data-col=contract]')).toContainText('만료')
  await expect(tr).toContainText('E2E시 › E2E구 › E2E동')
  await expect(tr).toContainText('3,300만원')
  // 검색어는 주소에 남아 상세에 다녀와도 그대로
  await tr.getByRole('link', { name: NAME }).click()
  await page.waitForURL(/\/media\/\d+/)
  await page.getByRole('link', { name: '매체 목록' }).click()
  await page.waitForURL((u) => u.pathname === '/media')
  await expect(page.getByPlaceholder(/매체명, 매체번호/)).toHaveValue('9999-1102')
  await expect(page.locator('tbody tr[data-media-code]')).toHaveCount(1)
})

test('수정 — 가격 줄을 지우고 바꾸면 그대로 저장, 계약 만료만 보기', async ({ page }) => {
  await login(page)
  const [{ id }] = JSON.parse(sqlRun(`select id from media where name='${NAME}' and deleted_at is null`))
  await page.goto(`/media/${id}`)
  const net = page.locator('[data-price-type=net]')
  await net.locator('[data-slot=price-line]').nth(0).getByRole('button', { name: '가격 줄 삭제' }).click()
  await net.locator('[data-slot=price-line]').nth(0).getByLabel('금액(만원)').fill('5500')
  await page.getByRole('button', { name: '저장' }).click()
  await page.waitForURL((u) => u.pathname === '/media')
  expect(JSON.parse(sqlRun(`select label, amount::int as amount from media_price where media_id=${id}`))).toEqual([{ label: '정면+측면', amount: 55_000_000 }])

  await page.goto('/media')
  await page.getByLabel('계약 만료만').check()
  const codes = await page.locator('tbody tr[data-media-code]').count()
  expect(codes).toBeGreaterThan(0)
  for (const t of await page.locator('tbody tr[data-media-code] [data-col=contract]').allInnerTexts()) expect(t).toContain('만료')
})

test('목록 관리 — 시공사 이름을 바꾸면 그 시공사를 쓰는 매체도 바뀐다', async ({ page }) => {
  await login(page)
  await page.goto('/media/options')
  const input = page.locator('[data-option-kind=vendor] [data-option="E2E시공"]').getByRole('textbox')
  await input.fill('E2E시공-새이름')
  await input.press('Enter')
  await expect(page.locator('[data-option-kind=vendor] [data-option="E2E시공-새이름"]')).toBeVisible()
  const [{ id }] = JSON.parse(sqlRun(`select id from media where name='${NAME}' and deleted_at is null`))
  expect(JSON.parse(sqlRun(`select name from media_vendor where media_id=${id}`))).toEqual([{ name: 'E2E시공-새이름' }])
  // 추가·삭제
  await page.getByLabel('구분 추가').fill('E2E구분')
  await page.locator('[data-option-kind=category]').getByRole('button', { name: '추가' }).click()
  await expect(page.locator('[data-option-kind=category] [data-option="E2E구분"]')).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'E2E구분 삭제' }).click()
  await expect(page.locator('[data-option-kind=category] [data-option="E2E구분"]')).toHaveCount(0)
})

test('조회 전용 — 볼 수는 있고 저장·추가·목록 관리는 없다', async ({ page }) => {
  await login(page, VIEWER)
  await page.goto('/media')
  await expect(page.getByRole('link', { name: '새 매체' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '목록 관리' })).toHaveCount(0)
  const [{ id }] = JSON.parse(sqlRun(`select id from media where name='${NAME}' and deleted_at is null`))
  await page.goto(`/media/${id}`)
  await expect(page.getByText('조회 전용')).toBeVisible()
  await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0)
  await page.goto('/media')
  await expect(page.locator('tbody [data-col=actions]')).toHaveCount(0)
  await page.goto('/media/options')
  await page.waitForURL((u) => u.pathname === '/media')
})

test('삭제 — 목록에서 사라진다', async ({ page }) => {
  await login(page)
  const [{ id, code }] = JSON.parse(sqlRun(`select id, code from media where name='${NAME}' and deleted_at is null`))
  await page.goto(`/media/${id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '매체 삭제' }).click()
  await page.waitForURL((u) => u.pathname === '/media')
  await expect(page.locator(`tbody tr[data-media-code="${code}"]`)).toHaveCount(0)
})

test('목록 줄 끝 수정·삭제 버튼 — 보증금 표처럼 (11/06 요청)', async ({ page }) => {
  sqlRun(`insert into media (entity, code, name) values ('kr', 'E2EROW1', 'E2E매체-줄버튼')`)
  await login(page)
  await page.goto('/media?q=E2E매체-줄버튼')
  const row = page.locator('tbody tr[data-media-code="E2EROW1"]')
  await expect(row.locator('[data-col=actions] button')).toHaveCount(2)

  // 연필 → 수정 화면
  await row.getByRole('button', { name: 'E2E매체-줄버튼 수정' }).click()
  await page.waitForURL(/\/media\/\d+$/)
  await expect(page.getByRole('heading', { name: '매체 수정' })).toBeVisible()

  // 휴지통 → 취소하면 그대로, 확인하면 사라짐
  await page.goto('/media?q=E2E매체-줄버튼')
  page.once('dialog', (d) => d.dismiss())
  await row.getByRole('button', { name: 'E2E매체-줄버튼 삭제' }).click()
  await expect(row).toHaveCount(1)
  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: 'E2E매체-줄버튼 삭제' }).click()
  await expect(row).toHaveCount(0)
  await page.reload()
  await expect(page.locator('tbody tr[data-media-code="E2EROW1"]')).toHaveCount(0)
  const [{ deleted }] = JSON.parse(sqlRun(`select deleted_at is not null as deleted from media where code='E2EROW1'`))
  expect(deleted).toBe(true)
})
