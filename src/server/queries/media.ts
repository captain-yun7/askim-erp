import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { media, mediaContact, mediaOption, mediaPrice, mediaStaff, mediaVendor, users, type Media, type MediaContact, type MediaPrice, type MediaVendor } from '@/lib/db/schema'
import { getCurrentEntity } from '@/server/entity'

export type MediaRow = Media & {
  prices: MediaPrice[]
  contacts: MediaContact[]
  vendors: MediaVendor[]
  staff: { id: string; name: string }[]
}

/**
 * 매체 담당자는 사내 중요 정보라 편집자에게만 (2026-11-17 요청) — 뷰어에게는 화면에 숨기는 것만이 아니라 아예 내려보내지 않는다.
 * withContacts 를 넘기지 않으면 빈 목록.
 */
type ChildOpts = { withContacts?: boolean }

async function withChildren(rows: Media[], { withContacts = false }: ChildOpts = {}): Promise<MediaRow[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [prices, contacts, vendors, staff] = await Promise.all([
    db.select().from(mediaPrice).where(inArray(mediaPrice.mediaId, ids)).orderBy(asc(mediaPrice.sortOrder), asc(mediaPrice.id)),
    withContacts ? db.select().from(mediaContact).where(inArray(mediaContact.mediaId, ids)).orderBy(asc(mediaContact.sortOrder), asc(mediaContact.id)) : Promise.resolve([] as MediaContact[]),
    db.select().from(mediaVendor).where(inArray(mediaVendor.mediaId, ids)).orderBy(asc(mediaVendor.sortOrder), asc(mediaVendor.id)),
    db
      .select({ mediaId: mediaStaff.mediaId, id: users.id, name: users.name })
      .from(mediaStaff)
      .innerJoin(users, eq(users.id, mediaStaff.userId))
      .where(inArray(mediaStaff.mediaId, ids))
      .orderBy(asc(users.name)),
  ])
  const group = <T extends { mediaId: number }>(xs: T[]) => {
    const m = new Map<number, T[]>()
    for (const x of xs) m.set(x.mediaId, [...(m.get(x.mediaId) ?? []), x])
    return m
  }
  const [p, c, v, s] = [group(prices), group(contacts), group(vendors), group(staff)]
  return rows.map((r) => ({
    ...r,
    prices: p.get(r.id) ?? [],
    contacts: c.get(r.id) ?? [],
    vendors: v.get(r.id) ?? [],
    staff: (s.get(r.id) ?? []).map(({ id, name }) => ({ id, name })),
  }))
}

export async function listMedia(opts: ChildOpts = {}): Promise<MediaRow[]> {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.entity, await getCurrentEntity()), isNull(media.deletedAt)))
    .orderBy(asc(media.code))
  return withChildren(rows, opts)
}

export async function getMedia(id: number, opts: ChildOpts = {}): Promise<MediaRow | null> {
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.entity, await getCurrentEntity()), isNull(media.deletedAt)))
    .limit(1)
  return row ? (await withChildren([row], opts))[0] : null
}

export async function listMediaOptions() {
  return db
    .select()
    .from(mediaOption)
    .where(eq(mediaOption.entity, await getCurrentEntity()))
    .orderBy(asc(mediaOption.kind), asc(mediaOption.sortOrder), asc(mediaOption.id))
}

/** 사내 담당으로 고를 직원 */
export async function listMediaStaffUsers() {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.isActive, true), ne(users.role, 'viewer')))
    .orderBy(asc(users.name))
}
