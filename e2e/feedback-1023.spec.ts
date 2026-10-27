import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/** 2026.10.23 요청 — 보증금·전속계약·보유자산 한 표 + 상태 칸 머리로 골라 보기, 거래 목록 금액 칸 합계·평균 */
const ADMIN = { email: 'admin@askim.local', password: 'askim2026!' }

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname !== '/login')
}
const ready = async (page: Page) => {
  await page.locator('[data-bulk-ready]').waitFor({ timeout: 30_000 })
  const btn = page.locator('[data-overdue-dialog]').getByRole('button', { name: '확인' })
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click()
    await page.locator('[data-overdue-dialog]').waitFor({ state: 'detached' })
  }
}

test.describe('보증금 한 표', () => {
  test('탭 없이 한 표, 처음엔 반환완료 빼고, 상태 칸 머리로 골라 본다', async ({ page }) => {
    await login(page)
    await page.goto('/deposits')
    await expect(page.getByRole('tablist')).toHaveCount(0)
    const rows = page.locator('tbody tr[data-kind]')
    await expect(rows.first()).toBeVisible()
    // 보증금과 전속계약이 한 표에
    expect(await page.locator('tbody tr[data-kind=deposit]').count()).toBeGreaterThan(0)
    expect(await page.locator('tbody tr[data-kind=exclusive]').count()).toBeGreaterThan(0)
    // 처음엔 반환완료 없음
    const statuses = async () => (await rows.locator('td[data-col=status]').allInnerTexts()).map((t) => t.trim())
    expect(await statuses()).not.toContain('반환완료')

    const menu = page.locator('[data-slot=deposit-status-filter]')
    const open = async () => {
      if (!(await menu.isVisible())) await page.getByRole('button', { name: '상태 골라 보기' }).click()
      await expect(menu).toBeVisible()
    }
    const countIn = async (label: string) => Number((await menu.getByRole('menuitemcheckbox', { name: new RegExp(`^${label}`) }).innerText()).replace(/\D/g, ''))
    await open()
    const counts = { held: await countIn('보유'), returned: await countIn('반환완료'), none: await countIn('상태 없음') }
    const before = await rows.count()

    // 반환완료를 켜면 그만큼 늘어난다
    await menu.getByRole('menuitemcheckbox', { name: /^반환완료/ }).click()
    await expect(rows).toHaveCount(before + counts.returned)

    // 보유만 남기기
    for (const label of ['미반환', '상계예정', '반환완료', '상태 없음']) await menu.getByRole('menuitemcheckbox', { name: new RegExp(`^${label}`) }).click()
    await expect(rows).toHaveCount(counts.held)
    for (const s of await statuses()) expect(s).toBe('보유')

    await menu.getByRole('menuitem', { name: '전체 보기' }).click()
    await expect(menu).toBeHidden()
    await open()
    await menu.getByRole('menuitem', { name: '반환완료 빼고 보기' }).click()
    await expect(rows).toHaveCount(before)
  })

  test('추가 버튼 셋 — 전속계약·자산 추가 창이 각각 열린다 (저장 안 함)', async ({ page }) => {
    await login(page)
    await page.goto('/deposits')
    for (const [btn, title, name] of [['전속계약 추가', '전속계약 추가', '매체명'], ['자산 추가', '자산 추가', '자산명'], ['보증금 추가', '보증금 추가', '거래처명']] as const) {
      await page.getByRole('button', { name: btn }).click()
      const dlg = page.getByRole('dialog')
      await expect(dlg.getByRole('heading', { name: title })).toBeVisible()
      await expect(dlg.locator('label', { hasText: new RegExp(`^${name}`) })).toBeVisible()
      await dlg.getByRole('button', { name: '취소' }).click()
      await expect(dlg).toBeHidden()
    }
  })
})

test.describe('거래 금액 칸 합계', () => {
  // 끌 칸이 화면 가장자리(스크롤바·합계 줄) 밑에 걸리지 않게 넓은 창
  test.use({ viewport: { width: 1600, height: 1000 } })
  test.beforeAll(() => {
    execSync('npx tsx scripts/e2e-fixture-0916.ts', { stdio: 'inherit' })
  })
  test.afterAll(() => {
    execSync('npx tsx scripts/e2e-cleanup.ts', { stdio: 'inherit' })
  })

  test('끌면 범위 합계·평균·개수, Ctrl+클릭으로 더하고 빼고, Esc 로 해제', async ({ page }) => {
    await login(page)
    await page.goto('/deals?fCode=E2E0916&year=all&sort=code&dir=asc')
    await ready(page)
    const bar = page.locator('[data-slot=cell-sum]')
    await expect(bar).toContainText('Ctrl')
    const trs = page.locator('[data-slot=deals-scroll] tbody tr[data-row-id]')
    expect(await trs.count()).toBeGreaterThanOrEqual(3)
    const cellOf = (i: number, col: string) => trs.nth(i).locator(`td[data-sum=${col}]`)
    const num = async (i: number, col: string) => Number((await cellOf(i, col).getAttribute('data-num')) ?? NaN)
    const center = async (i: number, col: string) => {
      const b = (await cellOf(i, col).boundingBox())!
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }

    // 1행 매출 ~ 3행 총매출 끌기 → 3행 × (매출·부가세·총매출) 9칸
    const a = await center(0, 'salesNet')
    const b = await center(2, 'salesGross')
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
    await page.mouse.move(b.x, b.y, { steps: 4 })
    await page.mouse.up()
    let expected = 0
    for (let i = 0; i < 3; i++) for (const col of ['salesNet', 'salesVat', 'salesGross']) expected += await num(i, col)
    await expect(bar).toContainText('개수: 9')
    await expect(bar.locator('[data-slot=cell-sum-total]')).toHaveText(expected.toLocaleString('ko-KR'))
    await expect(bar).toContainText(`평균: ${Math.round(expected / 9).toLocaleString('ko-KR')}`)
    await expect(page.locator('td[data-picked]')).toHaveCount(9)
    // 끈 뒤에 금액 수정 칸이 열리지 않는다
    await expect(page.locator('[data-slot=deals-scroll] input[inputmode=numeric]')).toHaveCount(0)

    // Ctrl+클릭: 4행째 손익 더하기 → 다시 누르면 빼기 (수정 칸 안 열림)
    const extra = trs.nth(0).locator('td[data-sum=profit]')
    await extra.click({ modifiers: ['ControlOrMeta'] })
    await expect(bar).toContainText('개수: 10')
    await expect(bar.locator('[data-slot=cell-sum-total]')).toHaveText((expected + (await num(0, 'profit'))).toLocaleString('ko-KR'))
    await extra.click({ modifiers: ['ControlOrMeta'] })
    await expect(bar).toContainText('개수: 9')

    // Ctrl+클릭은 금액(수정 가능 칸) 위에서도 수정 창을 열지 않는다
    await cellOf(3, 'salesNet').locator('button').click({ modifiers: ['ControlOrMeta'] })
    await expect(bar).toContainText('개수: 10')
    await expect(page.locator('[data-slot=deals-scroll] input[inputmode=numeric]')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(page.locator('td[data-picked]')).toHaveCount(0)
    await expect(bar).toContainText('Ctrl')

    // Shift+클릭 범위: 1행 손익 클릭 뒤 Shift+클릭 3행 손익
    await cellOf(0, 'profit').click()
    await cellOf(2, 'profit').click({ modifiers: ['Shift'] })
    await expect(page.locator('td[data-picked]')).toHaveCount(3)
    await expect(bar).toContainText('개수: 3')

    // 빈 칸(매입 없음)은 골라도 개수·합계에 안 들어간다 — 엑셀과 같다
    if ((await cellOf(1, 'purchaseNet').getAttribute('data-num')) === null) {
      await cellOf(1, 'purchaseNet').click({ modifiers: ['ControlOrMeta'] })
      await expect(page.locator('td[data-picked]')).toHaveCount(4)
      await expect(bar).toContainText('개수: 3')
    }

    // 그냥 클릭하면 예전처럼 금액 수정 칸이 열리고 선택은 풀린다
    await cellOf(0, 'salesNet').locator('button').click()
    await expect(page.locator('[data-slot=deals-scroll] input[inputmode=numeric]')).toHaveCount(1)
    await expect(page.locator('td[data-picked]')).toHaveCount(0)
    await page.keyboard.press('Escape')
  })
})
