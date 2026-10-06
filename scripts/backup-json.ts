import './_env'
import { writeFileSync } from 'node:fs'
import { db } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { getTableName, isTable } from 'drizzle-orm'

/**
 * 전체 테이블 JSON 백업 — 적재·복구 작업 전 필수
 *   DATABASE_URL="$PROD" npx tsx scripts/backup-json.ts _docs/backup/prod-<사유>-$(date +%Y%m%d-%H%M).json
 */
async function main() {
  const out = process.argv[2]
  if (!out) throw new Error('출력 경로를 지정하세요')
  const dump: Record<string, unknown[]> = {}
  for (const [name, t] of Object.entries(schema)) {
    if (!isTable(t)) continue
    // 마이그레이션 전 DB 에는 아직 없는 테이블·컬럼이 있을 수 있다 — 전체가 실패하지 않도록 그 테이블은 건너뛰고 알린다
    // (2026-09-28·10-06: 새 컬럼·테이블 때문에 변경 전 백업이 통째로 실패한 사고)
    try {
      dump[name] = await db.select().from(t as never)
    } catch (e) {
      const sql = (e as { cause?: unknown }).cause
      console.warn(`  ! ${name} 건너뜀 — ${(sql as Error)?.message ?? (e as Error).message}`)
      // raw 로 받을 수 있으면 컬럼 불일치여도 전체 행을 남긴다
      try {
        const tableName = getTableName(t as never)
        dump[name] = await db.execute(`select * from "${tableName}"` as never) as unknown as unknown[]
        console.warn(`    → "${tableName}" 을 select * 로 백업`)
      } catch {
        dump[name] = []
      }
    }
  }
  writeFileSync(out, JSON.stringify(dump))
  console.log(out, Object.entries(dump).map(([k, v]) => `${k}:${v.length}`).join(' '))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
