import './_env'
import { writeFileSync } from 'node:fs'
import { get, list } from '@vercel/blob'
import { decryptBackup } from '@/lib/backup'

/**
 * 크론 백업(Blob, 암호화) 내려받아 JSON 으로 복호화
 *   BLOB_READ_WRITE_TOKEN=... BACKUP_KEY=... npx tsx scripts/backup-decrypt.ts <out.json> [backups/askim-...json.gz.enc]
 * 경로를 생략하면 가장 최근 백업. BACKUP_KEY 는 _docs/backup/BACKUP_KEY.txt
 */
async function main() {
  const out = process.argv[2]
  if (!out) throw new Error('출력 경로를 지정하세요')
  const key = process.env.BACKUP_KEY
  if (!key) throw new Error('BACKUP_KEY 필요')
  let pathname = process.argv[3]
  if (!pathname) {
    const { blobs } = await list({ prefix: 'backups/' })
    const latest = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0]
    if (!latest) throw new Error('백업이 없습니다')
    pathname = latest.pathname
    console.log('최근 백업', pathname, latest.uploadedAt.toISOString(), latest.size, 'bytes')
  }
  const res = await get(pathname, { access: 'private' })
  if (!res || res.statusCode !== 200) throw new Error(`내려받기 실패 ${res?.statusCode}`)
  const buf = Buffer.from(await new Response(res.stream).arrayBuffer())
  const json = decryptBackup(buf, key)
  writeFileSync(out, json)
  const dump = JSON.parse(json) as Record<string, unknown[]>
  console.log(out, Object.entries(dump).map(([k, v]) => `${k}:${v.length}`).join(' '))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
