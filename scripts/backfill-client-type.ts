import './_env'
import * as XLSX from 'xlsx'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { counterparty } from '@/lib/db/schema'
import { CLIENT_TYPES, type ClientType } from '@/lib/client-type'

/**
 * 거래처 구분 초기값 (2026-09-28). 추정 규칙은 고객 예시 24곳 중 16곳만 맞아 쓰지 않는다.
 *   1) 고객이 요청서 예시 표에 직접 적은 거래처·구분 (SAMPLE_XLSX 의 "1. 매출 거래처 분석" 표)
 *   2) 매출의 과반이 상품구분 '중국사업'인 거래처 → 중국사업부 (예시의 알리페이·원화통장 수금과 같은 규칙, 예시와 100% 일치)
 * 나머지는 비워 두고(미지정) 고객이 거래처 목록에서 지정한다. 이미 값이 있는 거래처는 건드리지 않는다.
 *   DRY_RUN=1 npx tsx scripts/backfill-client-type.ts
 */
const DRY = process.env.DRY_RUN === '1'
const SAMPLE = process.env.SAMPLE_XLSX ?? '_docs/specs/feedback/20260928/2026.09.28 요청사항_매출분석보고서 부분.xlsx'
const norm = (s: string) => s.replace(/\(주\)|（주）|㈜|주식회사|\s/g, '').toLowerCase()

async function main() {
  const labelToCode = new Map<string, ClientType>(CLIENT_TYPES.map((t) => [t.label, t.value]))
  const rows = XLSX.utils.sheet_to_json<unknown[]>(XLSX.readFile(SAMPLE).Sheets['Sheet1'], { header: 1, defval: null })
  const start = rows.findIndex((r) => r?.[0] === '매출거래처')
  const sample = new Map<string, ClientType>()
  for (let i = start + 1; i < rows.length; i++) {
    const [name, kind] = rows[i] as [unknown, unknown]
    if (!name || name === '총합계') break
    const code = labelToCode.get(String(kind ?? '').trim())
    if (code) sample.set(norm(String(name)), code)
  }

  const cps = await db.select({ id: counterparty.id, name: counterparty.name, clientType: counterparty.clientType }).from(counterparty)
  const china = new Set(
    ((await db.execute(sql`
      select d.issuer_counterparty_id id from deal d join deal_category k on k.id = d.category_id
      where d.deleted_at is null and d.issuer_counterparty_id is not null and coalesce(d.sales_amount_net, 0) > 0
      group by 1 having count(*) filter (where k.code = 'china_biz') * 2 > count(*)`)) as unknown as { id: string }[]).map((r) => r.id),
  )
  const plan: { id: string; name: string; type: ClientType; why: string }[] = []
  for (const c of cps) {
    if (c.clientType) continue
    const fromSample = sample.get(norm(c.name))
    if (fromSample) plan.push({ id: c.id, name: c.name, type: fromSample, why: '고객 예시' })
    else if (china.has(c.id)) plan.push({ id: c.id, name: c.name, type: 'china', why: '중국사업 매출' })
  }
  const matched = new Set(plan.filter((p) => p.why === '고객 예시').map((p) => norm(p.name)))
  console.log(`고객 예시 ${sample.size}곳 중 거래처 매칭 ${matched.size}곳, 중국사업 ${plan.filter((p) => p.why !== '고객 예시').length}곳`)
  for (const k of sample.keys()) if (!matched.has(k) && !cps.some((c) => norm(c.name) === k && c.clientType)) console.log('  예시에 있으나 거래처를 못 찾음:', k)
  for (const p of plan) console.log(`  ${p.type}\t${p.name}\t(${p.why})`)
  if (!DRY) for (const p of plan) await db.update(counterparty).set({ clientType: p.type, updatedAt: sql`updated_at` }).where(eq(counterparty.id, p.id))
  console.log(DRY ? 'DRY' : `✓ ${plan.length}곳 지정`)
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
