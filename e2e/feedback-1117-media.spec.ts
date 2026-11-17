import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-11-17 요청 — 매체 담당자는 사내 중요 정보라 편집자에게만. 뷰어는 목록·상세·검색 어디서도 못 본다 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const MEMBER = { email: 'member.e2e@askim.local', password: PW }
const NAME = 'E2E매체-담당자'
const PHONE = '010-9876-1117'
const CONTACT = 'E2E담당홍길동'

async function login(page: Page, who: { email: string; password: string }) {
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
let mediaId = 0
test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
  sqlRun(`delete from media where name='${NAME}'`)
  ;[{ id: mediaId }] = JSON.parse(sqlRun(`insert into media (entity, code, name) values ('kr', 'E2ECON1', '${NAME}') returning id`))
  sqlRun(`insert into media_contact (media_id, name, title, company, phone) values (${mediaId}, '${CONTACT}', '부장', 'E2E건물', '${PHONE}')`)
  sqlRun(`update users set media_access='view' where email='${MEMBER.email}'`)
})
test.afterAll(() => {
  sqlRun(`update users set media_access='view' where email='${MEMBER.email}'`)
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('뷰어 — 목록에 매체 담당자 칸이 없고, 담당자 이름·연락처가 페이지 어디에도 내려오지 않는다', async ({ page }) => {
  await login(page, MEMBER)
  await page.goto(`/media?q=${NAME}`)
  await expect(page.locator('tbody tr[data-media-code="E2ECON1"]')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '매체 담당자' })).toHaveCount(0)
  await expect(page.locator('[data-col=contact]')).toHaveCount(0)
  const html = await page.content()
  expect(html).not.toContain(PHONE)
  expect(html).not.toContain(CONTACT)

  // 담당자·연락처로 검색해도 안 나온다
  await page.goto(`/media?q=${PHONE}`)
  await expect(page.locator('tbody tr[data-media-code="E2ECON1"]')).toHaveCount(0)
  await page.goto(`/media?q=${CONTACT}`)
  await expect(page.locator('tbody tr[data-media-code="E2ECON1"]')).toHaveCount(0)
})

test('뷰어 — 상세에도 매체 담당자 칸이 없다', async ({ page }) => {
  await login(page, MEMBER)
  await page.goto(`/media/${mediaId}`)
  await expect(page.getByText('조회 전용')).toBeVisible()
  await expect(page.getByRole('heading', { name: /매체 담당자/ })).toHaveCount(0)
  const html = await page.content()
  expect(html).not.toContain(PHONE)
  expect(html).not.toContain(CONTACT)
})

test('편집자(관리자·편집자 권한 팀원) — 목록·상세·검색에서 매체 담당자가 보인다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto(`/media?q=${PHONE}`)
  const row = page.locator('tbody tr[data-media-code="E2ECON1"]')
  await expect(page.getByRole('columnheader', { name: '매체 담당자' })).toBeVisible()
  await expect(row.locator('[data-col=contact]')).toContainText(CONTACT)
  await expect(row.locator('[data-col=contact]')).toContainText(PHONE)
  await page.goto(`/media/${mediaId}`)
  await expect(page.getByRole('heading', { name: /매체 담당자/ })).toBeVisible()
  await expect(page.getByLabel('연락처', { exact: true })).toHaveValue(PHONE)

  // 팀원을 편집자로 바꾸면 바로 보인다
  sqlRun(`update users set media_access='edit' where email='${MEMBER.email}'`)
  await login(page, MEMBER)
  await page.goto(`/media?q=${NAME}`)
  await expect(page.locator('tbody tr[data-media-code="E2ECON1"] [data-col=contact]')).toContainText(CONTACT)
})

test('편집자가 상세에서 저장해도 담당자가 지워지지 않는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto(`/media/${mediaId}`)
  await page.getByRole('button', { name: '저장' }).click()
  await page.waitForURL((u) => u.pathname === '/media')
  expect(JSON.parse(sqlRun(`select count(*)::int n from media_contact where media_id=${mediaId}`))[0].n).toBe(1)
})
