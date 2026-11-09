import { test, expect, type Browser, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-11-09 요청 — 매체관리 권한을 구글시트처럼 사람별 뷰어/편집자로 */
const PW = 'askim2026!'
const ADMIN = { email: 'admin@askim.local', password: PW }
const MEMBER = { email: 'member.e2e@askim.local', password: PW }
const NAME = 'E2E매체-권한'

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

const memberAccess = () => (JSON.parse(sqlRun(`select media_access from users where email='${MEMBER.email}'`)) as { media_access: string }[])[0].media_access

async function setMemberAccess(page: Page, label: '뷰어' | '편집자') {
  await page.goto('/admin/users')
  const select = page.getByRole('combobox', { name: 'E2E팀원 매체관리 권한' })
  await select.click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await expect(page.getByText(label === '편집자' ? '매체관리 편집자로 바꿨습니다' : '매체관리 뷰어로 바꿨습니다')).toBeVisible()
  await expect(select).toContainText(label)
}

async function memberPage(browser: Browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await login(page, MEMBER)
  return page
}

test.describe.configure({ mode: 'serial' })
let mediaId = 0
test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
  sqlRun(`delete from media where name='${NAME}'`)
  ;[{ id: mediaId }] = JSON.parse(sqlRun(`insert into media (entity, code, name) values ('kr', 'E2EACC1', '${NAME}') returning id`))
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

test('사용자 관리 — 영업은 처음엔 뷰어, 관리자는 항상 편집자(바꿀 수 없음)', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin/users')
  await expect(page.getByRole('columnheader', { name: '매체관리' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'E2E팀원 매체관리 권한' })).toContainText('뷰어')
  const admin = page.getByRole('row').filter({ hasText: 'admin@askim.local' }).getByRole('combobox', { name: /매체관리 권한/ })
  await expect(admin).toContainText('편집자')
  await expect(admin).toBeDisabled()
})

test('뷰어 — 매체를 볼 수는 있지만 추가·수정·삭제는 안 된다', async ({ browser }) => {
  const m = await memberPage(browser)
  await m.goto(`/media?q=${NAME}`)
  await expect(m.locator('tbody tr[data-media-code="E2EACC1"]')).toBeVisible()
  await expect(m.getByRole('link', { name: '새 매체' })).toHaveCount(0)
  await expect(m.locator('tbody [data-col=actions]')).toHaveCount(0)
  await m.goto(`/media/${mediaId}`)
  await expect(m.getByText('조회 전용')).toBeVisible()
  await expect(m.getByRole('button', { name: '저장' })).toHaveCount(0)
  await m.goto('/media/new')
  await m.waitForURL((u) => u.pathname === '/media')
  await m.context().close()
})

test('편집자로 바꾸면 다시 로그인하지 않아도 바로 수정·삭제 가능, 뷰어로 되돌리면 다시 막힘', async ({ page, browser }) => {
  const m = await memberPage(browser)
  await login(page, ADMIN)

  await setMemberAccess(page, '편집자')
  expect(memberAccess()).toBe('edit')
  const [log] = JSON.parse(sqlRun(`select summary from audit_log where action='user.media_access' order by at desc limit 1`))
  expect(log.summary).toContain('편집자')

  // 팀원은 같은 로그인 그대로 새로고침만
  await m.goto(`/media?q=${NAME}`)
  await expect(m.getByRole('link', { name: '새 매체' })).toBeVisible()
  await expect(m.locator('tbody tr[data-media-code="E2EACC1"] [data-col=actions] button')).toHaveCount(2)
  await m.goto(`/media/${mediaId}`)
  await expect(m.getByRole('heading', { name: '매체 수정' })).toBeVisible()
  await m.getByLabel('매체명').fill(`${NAME}2`)
  await m.getByRole('button', { name: '저장' }).click()
  await expect.poll(() => JSON.parse(sqlRun(`select name from media where id=${mediaId}`))[0].name).toBe(`${NAME}2`)

  await setMemberAccess(page, '뷰어')
  expect(memberAccess()).toBe('view')
  await m.goto(`/media?q=${NAME}`)
  await expect(m.getByRole('link', { name: '새 매체' })).toHaveCount(0)
  await expect(m.locator('tbody [data-col=actions]')).toHaveCount(0)
  await m.goto('/media/new')
  await m.waitForURL((u) => u.pathname === '/media')
  await m.context().close()
})
