import type { Page } from '@playwright/test'

/**
 * 새 거래 등록 화면의 필수(*) 항목 채우기 — 확정저장은 필수 항목이 비면 막힌다 (2026-10-06 요청).
 * 매출 쪽은 항상 채우고, purchase 를 주면 매입 쪽도 채운다.
 */
export async function fillRequiredDeal(page: Page, opts: { code?: string; item: string; sales: string; purchase?: string; counterparty?: string } = { item: 'E2E', sales: '1000000' }) {
  const field = (label: string) => page.locator(`div:has(> label:text-is("${label}")) input`).first()
  const pickSelect = async (label: string) => {
    const trigger = page.locator(`div:has(> label:text-is("${label}")) [role=combobox]`).first()
    if ((await trigger.innerText()).trim()) return
    await trigger.click()
    // 담당자는 관리자 계정이면 '관리자' 본인으로 — 다른 테스트의 영업 계정 목록에 섞이지 않게
    await page.getByRole('option').first().waitFor()
    const preferred = page.getByRole('option', { name: /관리자/ })
    const option = label === '담당자' && (await preferred.count()) ? preferred.first() : page.getByRole('option').first()
    await option.click()
    await page.getByRole('listbox').waitFor({ state: 'hidden' }).catch(() => {})
  }
  const pickCounterparty = async (label: string, query: string) => {
    const box = page.locator(`div:has(> label:text-is("${label}"))`).first()
    if ((await box.getByLabel('지우기').count()) > 0) return
    await box.locator('input').fill(query)
    // 검색 결과 목록(.max-h-64)의 첫 항목 — '신규 등록' 버튼은 결과 목록 밖에 있다
    const item = box.locator('.max-h-64 button').first()
    await item.waitFor()
    await item.click()
  }
  if (opts.code) await field('거래코드').fill(opts.code)
  await pickSelect('담당자')
  await pickSelect('상품구분')
  await pickSelect('계정항목')
  await pickCounterparty('발행처', opts.counterparty ?? '주')
  if (!(await field('실광고주').inputValue())) await field('실광고주').fill('E2E 광고주')
  await field('품목명').fill(opts.item)
  for (const [label, v] of [['adStart', '2026-09-01'], ['adEnd', '2026-09-30'], ['salesDueDate', '2026-09-30']] as const) {
    const el = page.getByLabel(label)
    if (!(await el.inputValue())) {
      await el.fill(v)
      await el.press('Tab')
    }
  }
  await pickSelect('매출수단')
  await page.locator('div:has(> label:has-text("매출금")) input').first().fill(opts.sales)
  if (opts.purchase) {
    await pickCounterparty('매체사', opts.counterparty ?? '주')
    if (!(await field('수수료').inputValue())) await field('수수료').fill('입금가')
    if (!(await field('결산연도').inputValue())) await field('결산연도').fill('2026')
    if (!(await field('결산월').inputValue())) await field('결산월').fill('9')
    await page.locator('div:has(> label:has-text("매입금")) input').first().fill(opts.purchase)
  }
}
