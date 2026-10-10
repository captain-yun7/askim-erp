import { del, list, put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { dumpAllTables, encryptBackup } from '@/lib/backup'

/**
 * 매일 DB 전체를 암호화해 Blob 에 보관 (vercel.json crons, KST 03:00) — 2026-10-10 Supabase 서울 이전
 * Supabase Free 는 7일 미사용 시 멈추므로 이 조회가 keep-alive 도 겸한다. 30일 지난 백업은 지운다.
 * 복구: scripts/backup-decrypt.ts
 */
export const maxDuration = 120
const KEEP_DAYS = 30

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new NextResponse('Unauthorized', { status: 401 })
  const key = process.env.BACKUP_KEY
  if (!key) return NextResponse.json({ error: 'BACKUP_KEY 없음' }, { status: 500 })

  const warnings: string[] = []
  const dump = await dumpAllTables((m) => warnings.push(m))
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
  const body = encryptBackup(JSON.stringify(dump), key)
  const blob = await put(`backups/askim-${stamp}.json.gz.enc`, body, { access: 'private', addRandomSuffix: false, contentType: 'application/octet-stream' })

  const cutoff = Date.now() - KEEP_DAYS * 86_400_000
  const old = (await list({ prefix: 'backups/' })).blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff)
  if (old.length) await del(old.map((b) => b.url))

  const counts = Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length]))
  return NextResponse.json({ ok: true, pathname: blob.pathname, bytes: body.length, deleted: old.length, warnings, counts })
}
