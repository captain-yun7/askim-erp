import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'

const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('http://localhost:3300/')
}

test('입금 토글 1회의 네트워크 비용', async ({ page }) => {
  await login(page)
  await page.goto('/deals?year=2026')
  await page.waitForSelector('tbody tr')
  await page.waitForTimeout(2500) // 링크 프리페치가 끝난 뒤부터 측정

  await page.evaluate(() => performance.clearResourceTimings())
  const toggle = page.locator('tbody tr button[title*="클릭하면"]').first()
  const t0 = Date.now()
  await toggle.click()
  await page.waitForTimeout(5000)

  const entries = await page.evaluate(() =>
    (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((e) => new URL(e.name).pathname.startsWith('/deals'))
      .map((e) => ({ url: new URL(e.name).pathname + new URL(e.name).search, bytes: e.transferSize, ms: Math.round(e.duration) })),
  )
  const out = {
    요청수: entries.length,
    총KB: +(entries.reduce((a, e) => a + e.bytes, 0) / 1024).toFixed(1),
    서버시간합ms: entries.reduce((a, e) => a + e.ms, 0),
    내역: entries.map((e) => `${e.url.slice(0, 30)} ${(e.bytes / 1024).toFixed(0)}KB ${e.ms}ms`),
    클릭후경과ms: Date.now() - t0,
  }
  console.log('PERF_RESULT ' + JSON.stringify(out, null, 2))
  fs.writeFileSync(process.env.PERF_OUT ?? '/tmp/perf.json', JSON.stringify(out, null, 2))
  // 전체 목록 RSC(80KB+)는 딱 1회만 — router.refresh() 중복 제거 회귀 방지
  const heavy = entries.filter((e) => e.bytes > 20 * 1024)
  expect(heavy.length).toBe(1)
})

test('토글 결과가 refresh 없이 화면·DB에 반영된다', async ({ page }) => {
  await login(page)
  await page.goto('/deals?year=2026')
  await page.waitForSelector('tbody tr')
  const toggle = page.locator('tbody tr button[title*="클릭하면"]').first()
  const before = (await toggle.innerText()).trim()

  await toggle.click()
  await expect
    .poll(async () => (await toggle.innerText()).trim(), { timeout: 10_000 })
    .not.toBe(before)
  const after = (await toggle.innerText()).trim()

  await page.reload()
  await page.waitForSelector('tbody tr')
  const reloaded = (await page.locator('tbody tr button[title*="클릭하면"]').first().innerText()).trim()
  expect(reloaded).toBe(after) // 저장 확인

  // 원복
  await page.locator('tbody tr button[title*="클릭하면"]').first().click()
  await expect
    .poll(async () => (await page.locator('tbody tr button[title*="클릭하면"]').first().innerText()).trim(), { timeout: 10_000 })
    .toBe(before)
})

test('서버 응답이 2초 걸려도 토글은 즉시 반영된다 (낙관적 업데이트)', async ({ page }) => {
  await login(page)
  await page.goto('/deals?year=2026')
  await page.waitForSelector('tbody tr')

  // 운영(한국↔버지니아) 왕복을 흉내내 서버액션 응답을 2초 지연
  await page.route('**/deals?*', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 2000))
    await route.continue()
  })

  const toggle = page.locator('tbody tr button[title*="클릭하면"]').first()
  const before = (await toggle.innerText()).trim()
  const t0 = Date.now()
  await toggle.click()
  await expect
    .poll(async () => (await toggle.innerText()).trim(), { timeout: 5000, intervals: [10] })
    .not.toBe(before)
  const flipMs = Date.now() - t0
  console.log(`OPTIMISTIC_FLIP_MS ${flipMs}`)
  expect(flipMs).toBeLessThan(500) // 서버 2초 지연에도 즉시 반영

  // 서버 응답 후에도 상태 유지 + 원복
  await page.waitForTimeout(3000)
  const after = (await toggle.innerText()).trim()
  expect(after).not.toBe(before)
  await toggle.click()
  await expect.poll(async () => (await toggle.innerText()).trim(), { timeout: 8000 }).toBe(before)
})
