import { getTableName, isTable } from 'drizzle-orm'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { db } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

/** 전체 테이블 JSON 덤프 — 적재·복구 작업 전 필수, 매일 크론 백업에도 사용 */
export async function dumpAllTables(warn: (msg: string) => void = console.warn) {
  const dump: Record<string, unknown[]> = {}
  for (const [name, t] of Object.entries(schema)) {
    if (!isTable(t)) continue
    // 마이그레이션 전 DB 에는 아직 없는 테이블·컬럼이 있을 수 있다 — 전체가 실패하지 않도록 그 테이블은 건너뛰고 알린다
    // (2026-09-28·10-06: 새 컬럼·테이블 때문에 변경 전 백업이 통째로 실패한 사고)
    try {
      dump[name] = await db.select().from(t as never)
    } catch (e) {
      const sql = (e as { cause?: unknown }).cause
      warn(`  ! ${name} 건너뜀 — ${(sql as Error)?.message ?? (e as Error).message}`)
      try {
        const tableName = getTableName(t as never)
        dump[name] = (await db.execute(`select * from "${tableName}"` as never)) as unknown as unknown[]
        warn(`    → "${tableName}" 을 select * 로 백업`)
      } catch {
        dump[name] = []
      }
    }
  }
  return dump
}

/** gzip → AES-256-GCM. 결과 = iv(12) + tag(16) + 암호문. 키는 64자리 hex (BACKUP_KEY) */
export function encryptBackup(json: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('BACKUP_KEY 는 64자리 hex 여야 합니다')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(json, 'utf8'))), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

export function decryptBackup(buf: Buffer, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const gz = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()])
  return gunzipSync(gz).toString('utf8')
}
