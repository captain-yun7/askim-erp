/**
 * 인사관리 초기 적재 (2026-10-02 요청) — 고객 엑셀의 '인사관리' 시트를 employee 테이블에 넣는다.
 * 급여 정보이므로 데이터는 저장소에 두지 않고 파일 경로로만 받는다.
 *
 *   DRY_RUN=1 npx tsx scripts/import-employees.ts "<엑셀 경로>"
 *
 * 같은 성함 + 입사일이 이미 있으면 건너뛴다 (다시 돌려도 중복되지 않음).
 */
import './_env'
import * as XLSX from 'xlsx'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { employee } from '@/lib/db/schema'
import { cleanText, parseDate, parseNumber } from './import-utils'

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('엑셀 경로를 넘겨 주세요')
  const dry = process.env.DRY_RUN === '1'
  // cellDates:false — 날짜가 하루 밀리는 사고(2026-09-16) 방지
  const wb = XLSX.readFile(file, { cellDates: false })
  const sheetName = wb.SheetNames.find((n) => n.includes('인사관리'))
  if (!sheetName) throw new Error("'인사관리' 시트를 찾지 못했습니다")
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null })
  const headerAt = rows.findIndex((r) => r.some((c) => cleanText(c) === '성함'))
  if (headerAt < 0) throw new Error("'성함' 제목 줄을 찾지 못했습니다")
  const col = (label: string) => rows[headerAt].findIndex((c) => (cleanText(c) ?? '').replace(/\s/g, '').startsWith(label))
  const C = { name: col('성함'), position: col('직급'), birth: col('주민번호'), dept: col('부서'), hire: col('입사일'), annual: col('기본급'), monthly: col('월급여'), incentive: col('인센티브'), leave: col('퇴사일'), pension: col('퇴직연금'), memo: col('비고') }
  const missing = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k)
  if (missing.length) throw new Error(`열을 찾지 못했습니다: ${missing.join(', ')}`)

  const money = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseNumber(typeof v === 'string' ? v.replace(/[₩\s]/g, '') : v)
    return n == null || Number.isNaN(n) ? null : String(Math.round(Number(n)))
  }
  const str = (v: unknown) => {
    const s = v == null ? null : String(v).trim()
    return s && s !== '-' ? s : null
  }

  let added = 0
  let skipped = 0
  let order = 0
  for (const r of rows.slice(headerAt + 1)) {
    const name = cleanText(r[C.name])
    if (!name) continue
    order++
    const values = {
      name,
      position: str(r[C.position]),
      birthCode: str(r[C.birth]),
      department: str(r[C.dept]),
      hireDate: parseDate(r[C.hire]),
      annualSalary: money(r[C.annual]),
      monthlySalary: money(r[C.monthly]),
      // 엑셀에 줄바꿈 대신 "/n" 으로 적힌 곳이 있다
      incentive: str(r[C.incentive])?.replace(/\/n\s*,?\s*/g, ', ') ?? null,
      leaveDate: parseDate(typeof r[C.leave] === 'string' ? (r[C.leave] as string).replace(/\./g, '-') : r[C.leave]),
      pensionYear: str(r[C.pension]) ? parseInt(String(r[C.pension]), 10) || null : null,
      memo: str(r[C.memo]),
      displayOrder: order,
    }
    const dup = await db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.name, name), isNull(employee.deletedAt), values.hireDate ? eq(employee.hireDate, values.hireDate) : isNull(employee.hireDate)))
      .limit(1)
    if (dup.length) {
      skipped++
      continue
    }
    if (!dry) await db.insert(employee).values(values)
    added++
    // 급여·주민번호는 화면에 찍지 않는다
    console.log(`  ${dry ? '(미리보기) ' : ''}${order}. ${name} · ${values.department ?? '-'} · 입사 ${values.hireDate ?? '-'}${values.leaveDate ? ` · 퇴사 ${values.leaveDate}` : ''} · 연봉 ${values.annualSalary ? '있음' : '없음'} · 월급여 ${values.monthlySalary ? '있음' : '없음'}`)
  }
  console.log(`${dry ? '[미리보기] ' : '✓ '}추가 ${added}명, 이미 있어 건너뜀 ${skipped}명`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
