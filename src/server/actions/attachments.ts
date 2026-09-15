'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { del, put } from '@vercel/blob'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { attachment, users } from '@/lib/db/schema'
import { getSessionUser, isViewer } from '@/server/auth/guards'
import { audit, diffFields } from '@/server/audit'

export type AttachmentTarget = 'deposit' | 'contract' | 'deal'
const targetSchema = z.enum(['deposit', 'contract', 'deal'])

const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
const ALLOWED = /\.(pdf|png|jpe?g|gif|webp|heic|docx?|xlsx?|pptx?|hwpx?|txt|zip)$/i

export type AttachmentInfo = {
  id: string
  filename: string
  contentType: string
  size: number
  createdAt: string
  uploadedBy: string | null
}

export async function listAttachments(targetType: AttachmentTarget, targetId: string): Promise<AttachmentInfo[]> {
  const user = await getSessionUser()
  if (!user) return []
  const rows = await db
    .select({ id: attachment.id, filename: attachment.filename, contentType: attachment.contentType, size: attachment.size, createdAt: attachment.createdAt, uploadedBy: users.name })
    .from(attachment)
    .leftJoin(users, eq(users.id, attachment.uploadedBy))
    .where(and(eq(attachment.targetType, targetType), eq(attachment.targetId, targetId)))
    .orderBy(attachment.createdAt)
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

/** 대상별 첨부 개수 (목록 아이콘 배지용) */
export async function getAttachmentCounts(targetType: AttachmentTarget, targetIds: string[]): Promise<Record<string, number>> {
  if (targetIds.length === 0) return {}
  const rows = await db
    .select({ targetId: attachment.targetId, n: sql<number>`count(*)::int` })
    .from(attachment)
    .where(and(eq(attachment.targetType, targetType), inArray(attachment.targetId, targetIds)))
    .groupBy(attachment.targetId)
  return Object.fromEntries(rows.map((r) => [r.targetId, r.n]))
}

export async function uploadAttachment(formData: FormData): Promise<{ ok: true; attachment: AttachmentInfo } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (isViewer(user.role)) return { error: '첨부 권한이 없습니다' }
  const targetType = targetSchema.safeParse(formData.get('targetType'))
  const targetId = String(formData.get('targetId') ?? '')
  const file = formData.get('file')
  if (!targetType.success || !targetId) return { error: '대상이 잘못되었습니다' }
  if (!(file instanceof File) || file.size === 0) return { error: '파일을 선택하세요' }
  if (file.size > ATTACHMENT_MAX_BYTES) return { error: '파일은 20MB 까지 올릴 수 있습니다' }
  if (!ALLOWED.test(file.name)) return { error: 'PDF·이미지·오피스 문서·HWP·ZIP 파일만 올릴 수 있습니다' }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { error: '파일 저장소가 설정되지 않았습니다 (BLOB_READ_WRITE_TOKEN)' }

  const safeName = file.name.replace(/[/\\]/g, '_')
  const blob = await put(`attachments/${targetType.data}/${targetId}/${safeName}`, file, {
    access: 'private',
    addRandomSuffix: true,
    contentType: file.type || 'application/octet-stream',
  })
  const [row] = await db
    .insert(attachment)
    .values({
      targetType: targetType.data,
      targetId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      uploadedBy: user.id,
    })
    .returning({ id: attachment.id, createdAt: attachment.createdAt })
  await audit({ action: 'attachment.upload', targetType: targetType.data, targetId, targetLabel: file.name, summary: `첨부 올리기 ${file.name} (${targetType.data} ${targetId})`, detail: { size: file.size, contentType: file.type } })
  revalidatePath('/deposits')
  revalidatePath('/deals')
  return { ok: true, attachment: { id: row.id, filename: file.name, contentType: file.type, size: file.size, createdAt: row.createdAt.toISOString(), uploadedBy: user.name ?? null } }
}

export async function deleteAttachment(id: string): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (isViewer(user.role)) return { error: '삭제 권한이 없습니다' }
  const [row] = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1)
  if (!row) return { error: '첨부를 찾을 수 없습니다' }
  await del(row.blobUrl)
  await db.delete(attachment).where(eq(attachment.id, id))
  await audit({ action: 'attachment.delete', targetType: row.targetType, targetId: row.targetId, targetLabel: row.filename, summary: `첨부 삭제 ${row.filename} (${row.targetType} ${row.targetId})` })
  revalidatePath('/deposits')
  revalidatePath('/deals')
  return { ok: true }
}
