import './_env'
import { writeFileSync } from 'node:fs'
import { dumpAllTables } from '@/lib/backup'

/**
 * 전체 테이블 JSON 백업 — 적재·복구 작업 전 필수
 *   DATABASE_URL="$PROD" npx tsx scripts/backup-json.ts _docs/backup/prod-<사유>-$(date +%Y%m%d-%H%M).json
 */
async function main() {
  const out = process.argv[2]
  if (!out) throw new Error('출력 경로를 지정하세요')
  const dump = await dumpAllTables()
  writeFileSync(out, JSON.stringify(dump))
  console.log(out, Object.entries(dump).map(([k, v]) => `${k}:${v.length}`).join(' '))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
