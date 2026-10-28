import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026-10-28 운영 오류 — 다른 거래처와 같은 사업자번호로 저장하면 'This page couldn't load' 화면이 뜸 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }
const NO = '999-99-10280'

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const sqlRun = (q: string) =>
  execSync(`npx tsx -e "import('./scripts/_env').then(async()=>{const {db}=await import('@/lib/db/client');const {sql}=await import('drizzle-orm');const r=await db.execute(sql.raw(process.env.Q));console.log(JSON.stringify(r.rows??r));process.exit(0)})"`, { env: { ...process.env, Q: q } }).toString().trim().split('\n').pop()!

test.beforeAll(() => {
  execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
  sqlRun(`update counterparty set business_no='${NO}', client_type='agency' where name='E2E거래처0916-A'`)
  sqlRun(`update counterparty set client_type='agency' where name='E2E거래처0916-B'`)
})
test.afterAll(() => {
  execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
})

const bizInput = (page: Page) => page.getByPlaceholder('000-00-00000')

test('거래처 수정 — 다른 거래처와 같은 사업자번호면 오류 화면 대신 어느 거래처와 겹치는지 알려 주고, 고치면 저장된다', async ({ page }) => {
  await login(page)
  const id = JSON.parse(sqlRun(`select id from counterparty where name='E2E거래처0916-B'`))[0].id
  await page.goto(`/counterparties/${id}`)
  await bizInput(page).fill(NO)
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText(`사업자번호 ${NO} 는 이미 'E2E거래처0916-A'에 등록되어 있습니다`, { exact: false })).toBeVisible()
  await expect(page.getByText("This page couldn't load")).toHaveCount(0)
  await expect(bizInput(page)).toHaveValue(NO)
  // 다른 번호로 고치면 저장된다
  await bizInput(page).fill('999-99-10281')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('저장되었습니다')).toBeVisible()
  expect(JSON.parse(sqlRun(`select business_no from counterparty where id='${id}'`))[0].business_no).toBe('999-99-10281')
})

test('거래처 등록 — 같은 사업자번호면 알려 주고 만들지 않는다', async ({ page }) => {
  await login(page)
  await page.goto('/counterparties/new')
  await page.getByRole('combobox').first().click().catch(() => {})
  await page.keyboard.press('Escape')
  await page.locator('input').first().fill('E2E거래처1028중복')
  await bizInput(page).fill(NO)
  // 거래처 구분 고르기
  const type = page.locator('#cp-client-type')
  if (await type.count()) await type.selectOption({ index: 1 }).catch(async () => { await type.click(); await page.getByRole('option').first().click() })
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText(`이미 'E2E거래처0916-A'에 등록되어 있습니다`, { exact: false })).toBeVisible()
  expect(JSON.parse(sqlRun(`select count(*)::int n from counterparty where name='E2E거래처1028중복'`))[0].n).toBe(0)
})

test('같은 번호의 거래처를 삭제하면 — 그 번호로 다른 거래처를 저장할 수 있다 (위버케어·메디블록 사례)', async ({ page }) => {
  await login(page)
  sqlRun(`update counterparty set business_no='${NO}', deleted_at=null, is_active=true where name='E2E거래처0916-A'`)
  const [a] = JSON.parse(sqlRun(`select id from counterparty where name='E2E거래처0916-A'`))
  const [b] = JSON.parse(sqlRun(`select id from counterparty where name='E2E거래처0916-B'`))
  // 화면에서 A 삭제
  await page.goto(`/counterparties/${a.id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '거래처 삭제' }).first().click()
  await page.waitForURL((u) => u.pathname === '/counterparties')
  // B 에 같은 번호 넣고 저장
  await page.goto(`/counterparties/${b.id}`)
  await bizInput(page).fill(NO)
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('저장되었습니다')).toBeVisible()
  expect(JSON.parse(sqlRun(`select business_no from counterparty where id='${b.id}'`))[0].business_no).toBe(NO)
})
