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
    dump[name] = await db.select().from(t as never)
  }
  writeFileSync(out, JSON.stringify(dump))
  console.log(out, Object.entries(dump).map(([k, v]) => `${k}:${v.length}`).join(' '))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
