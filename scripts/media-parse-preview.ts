/**
 * 매체 엑셀 변환 미리보기 — DB 에 쓰지 않고 칸별로 어떻게 나뉘는지 출력한다.
 *   npx tsx scripts/media-parse-preview.ts <xlsx>
 */
import * as XLSX from 'xlsx'
import { cleanMediaName, parseContacts, parseContractPeriod, parsePriceCell, parseVendors, REGION_OF } from '@/lib/media-parse'

const file = process.argv[2]
const wb = XLSX.readFile(file, { cellDates: false })
const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['매체 기본정보'], { header: 1, defval: null }).slice(5)
const COLS = ['sale', 'net', 'landlord', 'prod_sale', 'prod_net'] as const
const fmt = (n: number | null) => (n == null ? '-' : n % 10000 === 0 ? `${(n / 10000).toLocaleString()}만` : `${n.toLocaleString()}원`)
let noAmount = 0, lines = 0
for (const r of rows) {
  if (!r || !r[2]) continue
  const name = cleanMediaName(r[2])
  const reg = REGION_OF[String(r[1]).trim()]
  console.log(`\n■ ${name} | ${r[0]} | ${reg ? reg.filter(Boolean).join('›') : '??' + r[1]} | 계약 ${r[6] ?? ''} ${JSON.stringify(parseContractPeriod(r[7]))}`)
  for (const c of parseContacts(r[3], r[4])) console.log('   담당', JSON.stringify(c))
  COLS.forEach((t, i) => {
    for (const p of parsePriceCell(r[8 + i])) {
      lines++
      if (p.amount == null) noAmount++
      console.log(`   ${t.padEnd(9)} [${p.label ?? ''}] ${fmt(p.amount)}${p.approx ? ' ~' : ''}${p.note ? '  (' + p.note + ')' : ''}`)
    }
  })
  const v = parseVendors(r[13]); if (v.length) console.log('   시공', JSON.stringify(v))
}
console.log(`\n가격 ${lines}줄, 금액 없는 줄 ${noAmount}`)
