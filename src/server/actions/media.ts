'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull, like, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { MEDIA_OPTION_KINDS, MEDIA_PRICE_TYPES, media, mediaContact, mediaOption, mediaPrice, mediaStaff, mediaVendor } from '@/lib/db/schema'
import { normalizePhone } from '@/lib/media-parse'
import { canManageLookups, getSessionUser, type SessionUser } from '@/server/auth/guards'
import { audit } from '@/server/audit'
import { getCurrentEntity } from '@/server/entity'

type Result<T = object> = ({ ok: true } & T) | { error: string }

async function requireEditor(): Promise<{ error: string } | { user: SessionUser }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (user.role === 'viewer') return { error: '수정 권한이 없습니다' }
  return { user }
}

const text = z.string().trim().optional().nullable().transform((v) => v || null)
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD')
  .or(z.literal(''))
  .optional()
  .nullable()
  .transform((v) => v || null)

const mediaSchema = z
  .object({
    category: text,
    regionCity: text,
    regionDistrict: text,
    regionArea: text,
    name: z.string().trim().min(1, '매체명을 입력하세요'),
    contractType: text,
    contractStart: dateStr,
    contractEnd: dateStr,
    contractNote: text,
    staffNote: text,
    runPeriod: text,
    status: z.string().trim().min(1).default('운영 중'),
    memo: text,
    prices: z
      .array(
        z.object({
          type: z.enum(MEDIA_PRICE_TYPES),
          label: text,
          // 화면에서는 만원 단위로 받는다
          amountMan: z
            .union([z.number(), z.string()])
            .optional()
            .nullable()
            .transform((v, ctx) => {
              if (v == null || String(v).trim() === '') return null
              const n = Number(String(v).replace(/,/g, ''))
              if (!Number.isFinite(n) || n < 0) {
                ctx.addIssue({ code: 'custom', message: '금액은 숫자(만원)로 입력하세요' })
                return z.NEVER
              }
              return Math.round(n * 10_000)
            }),
          approx: z.boolean().default(false),
          note: text,
        }),
      )
      .default([]),
    contacts: z
      .array(z.object({ name: text, title: text, company: text, phone: text, phone2: text }))
      .default([]),
    staffIds: z.array(z.string().uuid()).default([]),
    vendors: z.array(z.object({ name: z.string().trim().min(1), note: text })).default([]),
  })
  .refine((d) => !d.contractStart || !d.contractEnd || d.contractStart <= d.contractEnd, { message: '끝나는 날이 시작일보다 빠릅니다' })

export type MediaInput = z.input<typeof mediaSchema>

/** 새 매체번호 — M + 등록 연월(YYMM) + 그 달 순번 4자리 */
async function nextCode(entity: string): Promise<string> {
  const ym = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(2, 7).replace('-', '')
  const prefix = `M${ym}`
  const [{ max }] = await db
    .select({ max: sql<string | null>`max(${media.code})` })
    .from(media)
    .where(and(eq(media.entity, entity), like(media.code, `${prefix}%`)))
  const seq = max ? Number(max.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export async function saveMedia(id: number | null, raw: unknown): Promise<Result<{ id: number }>> {
  const guard = await requireEditor()
  if ('error' in guard) return guard
  const parsed = mediaSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const { prices, contacts, staffIds, vendors, ...base } = parsed.data
  const entity = await getCurrentEntity()

  const savedId = await db.transaction(async (tx) => {
    let mediaId = id
    if (mediaId != null) {
      const [hit] = await tx
        .update(media)
        .set(base)
        .where(and(eq(media.id, mediaId), eq(media.entity, entity), isNull(media.deletedAt)))
        .returning({ id: media.id })
      if (!hit) return null
      await Promise.all([
        tx.delete(mediaPrice).where(eq(mediaPrice.mediaId, mediaId)),
        tx.delete(mediaContact).where(eq(mediaContact.mediaId, mediaId)),
        tx.delete(mediaStaff).where(eq(mediaStaff.mediaId, mediaId)),
        tx.delete(mediaVendor).where(eq(mediaVendor.mediaId, mediaId)),
      ])
    } else {
      const [row] = await tx
        .insert(media)
        .values({ ...base, entity, code: await nextCode(entity), createdBy: guard.user.id })
        .returning({ id: media.id })
      mediaId = row.id
    }
    const mid = mediaId
    const priceRows = prices.filter((p) => p.label || p.amountMan != null || p.note)
    if (priceRows.length)
      await tx.insert(mediaPrice).values(priceRows.map((p, i) => ({ mediaId: mid, type: p.type, label: p.label, amount: p.amountMan == null ? null : String(p.amountMan), approx: p.approx, note: p.note, sortOrder: i })))
    const contactRows = contacts.filter((c) => c.name || c.title || c.company || c.phone || c.phone2)
    if (contactRows.length)
      await tx.insert(mediaContact).values(contactRows.map((c, i) => ({ mediaId: mid, ...c, phone: normalizePhone(c.phone), phone2: normalizePhone(c.phone2), sortOrder: i })))
    if (staffIds.length) await tx.insert(mediaStaff).values([...new Set(staffIds)].map((userId) => ({ mediaId: mid, userId })))
    if (vendors.length) await tx.insert(mediaVendor).values(vendors.map((v, i) => ({ mediaId: mid, name: v.name, note: v.note, sortOrder: i })))
    return mid
  })
  if (savedId == null) return { error: '매체를 찾을 수 없습니다' }
  await audit({ action: 'media.save', targetType: 'media', targetId: savedId, targetLabel: base.name, summary: `매체 ${id != null ? '수정' : '등록'} ${base.name}` })
  revalidatePath('/media')
  return { ok: true, id: savedId }
}

export async function deleteMedia(id: number): Promise<Result> {
  const guard = await requireEditor()
  if ('error' in guard) return guard
  const [row] = await db
    .update(media)
    .set({ deletedAt: new Date() })
    .where(and(eq(media.id, id), eq(media.entity, await getCurrentEntity()), isNull(media.deletedAt)))
    .returning({ name: media.name })
  if (!row) return { error: '매체를 찾을 수 없습니다' }
  await audit({ action: 'media.delete', targetType: 'media', targetId: id, targetLabel: row.name, summary: `매체 삭제 ${row.name}` })
  revalidatePath('/media')
  return { ok: true }
}

// ── 고를 수 있는 목록 (관리자) ──
async function requireOptionAdmin(): Promise<{ error: string } | { user: SessionUser }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canManageLookups(user.role)) return { error: '목록은 관리자만 바꿀 수 있습니다' }
  return { user }
}

const optionSchema = z.object({
  kind: z.enum(MEDIA_OPTION_KINDS),
  value: z.string().trim().min(1, '이름을 입력하세요'),
  parentId: z.number().int().nullable().default(null),
})

export async function addMediaOption(raw: unknown): Promise<Result> {
  const guard = await requireOptionAdmin()
  if ('error' in guard) return guard
  const parsed = optionSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const { kind, value, parentId } = parsed.data
  const entity = await getCurrentEntity()
  const [dup] = await db
    .select({ id: mediaOption.id })
    .from(mediaOption)
    .where(and(eq(mediaOption.entity, entity), eq(mediaOption.kind, kind), eq(mediaOption.value, value), parentId == null ? isNull(mediaOption.parentId) : eq(mediaOption.parentId, parentId)))
    .limit(1)
  if (dup) return { error: `'${value}' 는 이미 있습니다` }
  const [{ max }] = await db
    .select({ max: sql<number | null>`max(${mediaOption.sortOrder})` })
    .from(mediaOption)
    .where(and(eq(mediaOption.entity, entity), eq(mediaOption.kind, kind)))
  await db.insert(mediaOption).values({ entity, kind, value, parentId, sortOrder: (max ?? 0) + 1 })
  await audit({ action: 'media.option', targetType: 'media_option', summary: `매체 목록 추가 ${kind} ${value}` })
  revalidatePath('/media')
  return { ok: true }
}

export async function renameMediaOption(id: number, value: string): Promise<Result> {
  const guard = await requireOptionAdmin()
  if ('error' in guard) return guard
  const v = value.trim()
  if (!v) return { error: '이름을 입력하세요' }
  const entity = await getCurrentEntity()
  const [opt] = await db.select().from(mediaOption).where(and(eq(mediaOption.id, id), eq(mediaOption.entity, entity))).limit(1)
  if (!opt) return { error: '항목을 찾을 수 없습니다' }
  if (opt.value === v) return { ok: true }
  // 이미 그 값을 쓰는 매체도 같이 바꾼다
  await db.transaction(async (tx) => {
    await tx.update(mediaOption).set({ value: v }).where(eq(mediaOption.id, id))
    const scope = and(eq(media.entity, entity), isNull(media.deletedAt))
    if (opt.kind === 'category') await tx.update(media).set({ category: v }).where(and(scope, eq(media.category, opt.value)))
    if (opt.kind === 'contract_type') await tx.update(media).set({ contractType: v }).where(and(scope, eq(media.contractType, opt.value)))
    if (opt.kind === 'status') await tx.update(media).set({ status: v }).where(and(scope, eq(media.status, opt.value)))
    if (opt.kind === 'vendor')
      await tx.update(mediaVendor).set({ name: v }).where(and(eq(mediaVendor.name, opt.value), sql`${mediaVendor.mediaId} in (select id from media where ${scope})`))
    if (opt.kind === 'region') {
      // 시(부모 없음) → 구 → 동네. 같은 이름이 다른 구에 있을 수 있어 부모 이름까지 맞춘다
      const parent = opt.parentId == null ? null : (await tx.select().from(mediaOption).where(eq(mediaOption.id, opt.parentId)).limit(1))[0]
      if (!parent) await tx.update(media).set({ regionCity: v }).where(and(scope, eq(media.regionCity, opt.value)))
      else if (parent.parentId == null)
        await tx.update(media).set({ regionDistrict: v }).where(and(scope, eq(media.regionCity, parent.value), eq(media.regionDistrict, opt.value)))
      else await tx.update(media).set({ regionArea: v }).where(and(scope, eq(media.regionDistrict, parent.value), eq(media.regionArea, opt.value)))
    }
  })
  await audit({ action: 'media.option', targetType: 'media_option', targetId: id, summary: `매체 목록 이름 변경 ${opt.value} → ${v}` })
  revalidatePath('/media')
  return { ok: true }
}

export async function deleteMediaOption(id: number): Promise<Result> {
  const guard = await requireOptionAdmin()
  if ('error' in guard) return guard
  const entity = await getCurrentEntity()
  const [child] = await db.select({ id: mediaOption.id }).from(mediaOption).where(eq(mediaOption.parentId, id)).limit(1)
  if (child) return { error: '아래 단계 지역이 있어 지울 수 없습니다. 아래 단계부터 지우세요' }
  const [row] = await db.delete(mediaOption).where(and(eq(mediaOption.id, id), eq(mediaOption.entity, entity))).returning({ value: mediaOption.value })
  if (!row) return { error: '항목을 찾을 수 없습니다' }
  await audit({ action: 'media.option', targetType: 'media_option', targetId: id, summary: `매체 목록 삭제 ${row.value}` })
  revalidatePath('/media')
  return { ok: true }
}
