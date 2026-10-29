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
    await page.locator('[data-deposit-ready]').waitFor({ timeout: 30_000 })
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
    const counts = { held: await countIn('보유'), returned: await countIn('반환완료'), active: await countIn('계약중') }
    const before = await rows.count()

    // 반환완료를 켜면 그만큼 늘어난다
    await menu.getByRole('menuitemcheckbox', { name: /^반환완료/ }).click()
    await expect(rows).toHaveCount(before + counts.returned)

    // 보유만 남기기
    for (const label of ['계약중', '반환완료', '계약종료']) await menu.getByRole('menuitemcheckbox', { name: new RegExp(`^${label}`) }).click()
    await expect(rows).toHaveCount(counts.held)
    for (const s of await statuses()) expect(s).toBe('보유')

    await menu.getByRole('menuitem', { name: '전체 보기' }).click()
    await expect(menu).toBeHidden()
    await open()
    await menu.getByRole('menuitem', { name: '지금 보유·계약중만 보기' }).click()
    await expect(rows).toHaveCount(before)
  })

  test('추가 버튼 둘 — 보증금·전속계약 추가 창이 열리고, 자산 추가는 없다 (저장 안 함)', async ({ page }) => {
    await login(page)
    await page.goto('/deposits')
    await page.locator('[data-deposit-ready]').waitFor({ timeout: 30_000 })
    for (const [btn, title, name] of [['전속계약 추가', '전속계약 추가', '매체명'], ['보증금 추가', '보증금 추가', '거래처명']] as const) {
      await page.getByRole('button', { name: btn }).click()
      const dlg = page.getByRole('dialog')
      await expect(dlg.getByRole('heading', { name: title })).toBeVisible()
      await expect(dlg.locator('label', { hasText: new RegExp(`^${name}`) })).toBeVisible()
      await dlg.getByRole('button', { name: '취소' }).click()
      await expect(dlg).toBeHidden()
    }
    // 2026-10-28: 보유자산 구분 삭제, 칸 제목 거래처(매체명)
    await expect(page.getByRole('button', { name: '자산 추가' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '거래처(매체명)' })).toBeVisible()
  })
})

test('반환완료로 저장해도 목록에서 사라지지 않는다', async ({ page }) => {
  await login(page)
  await page.goto('/deposits')
  await page.locator('[data-deposit-ready]').waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: '보증금 추가' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('input').first().fill('E2E거래처1023반환')
  await dlg.locator('select').selectOption({ label: '반환완료' })
  await dlg.getByRole('button', { name: '저장' }).click()
  await expect(dlg).toBeHidden()
  const row = page.locator('tbody tr', { hasText: 'E2E거래처1023반환' })
  await expect(row).toHaveCount(1)
  await expect(row.locator('td[data-col=status]')).toHaveText('반환완료')
  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: '삭제' }).click()
  await expect(row).toHaveCount(0)
})

test('전속계약도 상태가 있다 — 계약종료로 저장하면 보이고, 기본 보기에선 빠진다', async ({ page }) => {
  // 2026-10-27 요청: 계약·자산 상태가 비어 있던 것
  await login(page)
  await page.goto('/deposits')
  await page.locator('[data-deposit-ready]').waitFor({ timeout: 30_000 })
  const menu = page.locator('[data-slot=deposit-status-filter]')
  const statusOf = (name: string) => page.locator('tbody tr', { hasText: name }).locator('td[data-col=status]')
  // 기존 계약은 계약중
  await expect(page.locator('tbody tr[data-kind=exclusive] td[data-col=status]').first()).toHaveText('계약중')

  await page.getByRole('button', { name: '전속계약 추가' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('input').first().fill('E2E거래처1027계약')
  await expect(dlg.getByLabel('상태')).toHaveValue('active')
  await dlg.getByLabel('상태').selectOption({ label: '계약종료' })
  await dlg.getByRole('button', { name: '저장' }).click()
  await expect(dlg).toBeHidden()
  await expect(statusOf('E2E거래처1027계약')).toHaveText('계약종료')

  // 기본 보기로 돌리면 빠진다
  await page.getByRole('button', { name: '상태 골라 보기' }).click()
  await menu.getByRole('menuitem', { name: '지금 보유·계약중만 보기' }).click()
  await expect(page.locator('tbody tr', { hasText: 'E2E거래처1027계약' })).toHaveCount(0)

  // 계약종료만 골라 보면 나오고, 지운다
  await page.getByRole('button', { name: '상태 골라 보기' }).click()
  await menu.getByRole('menuitemcheckbox', { name: /^계약종료/ }).click()
  await page.keyboard.press('Escape')
  const row = page.locator('tbody tr', { hasText: 'E2E거래처1027계약' })
  await expect(row).toHaveCount(1)
  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: '삭제' }).click()
  await expect(row).toHaveCount(0)
})

test('구분 제목을 눌러 골라 보고, 상태 메뉴엔 그 구분의 상태만 나온다', async ({ page }) => {
  // 2026-10-27 요청: 상태 메뉴가 복잡하다, 구분으로도 나눠 보기
  await login(page)
  await page.goto('/deposits')
  await page.locator('[data-deposit-ready]').waitFor({ timeout: 30_000 })
  const rows = page.locator('tbody tr[data-kind]')
  const kindMenu = page.locator('[data-slot=deposit-kind-filter]')
  const statusMenu = page.locator('[data-slot=deposit-status-filter]')
  const options = async () => {
    await page.getByRole('button', { name: '상태 골라 보기' }).click()
    await expect(statusMenu).toBeVisible()
    const names = (await statusMenu.getByRole('menuitemcheckbox').allInnerTexts()).map((t) => t.replace(/\d+/g, '').trim())
    await page.keyboard.press('Escape')
    await expect(statusMenu).toBeHidden()
    return names
  }
  expect(await options()).toEqual(['보유', '계약중', '반환완료', '계약종료'])

  // 전속계약만
  await page.getByRole('button', { name: '구분 골라 보기' }).click()
  const exclusiveCount = Number((await kindMenu.getByRole('menuitemcheckbox', { name: /^전속계약/ }).innerText()).replace(/\D/g, ''))
  await kindMenu.getByRole('menuitemcheckbox', { name: /^보증금/ }).click()
  await expect(kindMenu.getByRole('menuitemcheckbox')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(rows).toHaveCount(exclusiveCount)
  expect(new Set(await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-kind'))))).toEqual(new Set(['exclusive']))
  expect(await options()).toEqual(['계약중', '계약종료'])
  await expect(page.locator('[data-slot=deposit-filter-note]')).toContainText('전속계약')

  // 보증금만 → 보증금 상태 넷
  await page.getByRole('button', { name: '구분 골라 보기' }).click()
  await kindMenu.getByRole('menuitemcheckbox', { name: /^보증금/ }).click()
  await kindMenu.getByRole('menuitemcheckbox', { name: /^전속계약/ }).click()
  await page.keyboard.press('Escape')
  expect(await options()).toEqual(['보유', '반환완료'])
  for (const k of await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-kind')))) expect(k).toBe('deposit')

  await page.getByRole('button', { name: '구분 골라 보기' }).click()
  await kindMenu.getByRole('menuitem', { name: '전체 보기' }).click()
  expect(await page.locator('tbody tr[data-kind=exclusive]').count()).toBeGreaterThan(0)
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

  test('표 아래 가장자리로 끌면 저절로 스크롤되며 범위가 넓어진다', async ({ page }) => {
    await login(page)
    await page.goto('/deals?year=all')
    await ready(page)
    const box = (await page.locator('[data-slot=deals-scroll]').boundingBox())!
    const first = page.locator('[data-slot=deals-scroll] tbody tr[data-row-id]').first().locator('td[data-sum=salesNet]')
    const a = (await first.boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + a.width / 2, box.y + box.height - 5, { steps: 5 })
    const visible = await page.locator('td[data-picked]').count()
    await page.waitForTimeout(1200)
    await page.mouse.up()
    expect(await page.locator('[data-slot=deals-scroll]').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await page.locator('td[data-picked]').count()).toBeGreaterThan(visible)
    await expect(page.locator('[data-slot=deals-scroll] input[inputmode=numeric]')).toHaveCount(0)
  })
})
