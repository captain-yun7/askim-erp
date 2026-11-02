/**
 * 매체 엑셀(광고매체_회사보관용_v2.xlsx '매체 기본정보') → 매체관리 (2026-11-02)
 *   npx tsx scripts/import-media.ts <xlsx>            — 매체가 하나도 없을 때만 넣는다
 *   DRY_RUN=1 npx tsx scripts/import-media.ts <xlsx>  — 넣지 않고 건수만
 * 매체번호는 M2610 + 엑셀 순서 4자리. 고를 수 있는 목록(구분·지역·계약종류·시공사·관리 상태)도 엑셀 값으로 채운다.
 */
import './_env'
import * as XLSX from 'xlsx'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { media, mediaContact, mediaOption, mediaPrice, mediaStaff, mediaVendor, users, type MediaPriceType } from '@/lib/db/schema'
import { MEDIA_STATUSES } from '@/lib/media'
import { cleanMediaName, parseContacts, parseContractPeriod, parsePriceCell, parseStaff, parseVendors, REGION_OF } from '@/lib/media-parse'

const ENTITY = 'kr'
const DRY = process.env.DRY_RUN === '1'
const PRICE_COLS: MediaPriceType[] = ['sale', 'net', 'landlord', 'prod_sale', 'prod_net']

const str = (v: unknown) => (v == null ? null : String(v).replace(/\r/g, '').trim() || null)

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('엑셀 파일 경로를 주세요')
  const wb = XLSX.readFile(file, { cellDates: false })
  const sheet = wb.Sheets['매체 기본정보']
  if (!sheet) throw new Error("'매체 기본정보' 시트가 없습니다")
  const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
  const head = all.findIndex((r) => r?.[0] === '상품구분' && r?.[2] === '매체명')
  if (head < 0) throw new Error('머리글(상품구분·매체명) 줄을 못 찾았습니다')
  const rows = all.slice(head + 1).filter((r) => r && str(r[2]))

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(media).where(and(eq(media.entity, ENTITY), isNull(media.deletedAt)))
  if (n > 0 && !DRY) throw new Error(`이미 매체 ${n}건이 있습니다 — 덮어쓰지 않습니다`)

  const staffUsers = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true))
  const unknownRegions = new Set<string>()
  const plan = rows.map((r, i) => {
    const area = str(r[1])
    const region = area ? REGION_OF[area] : undefined
    if (area && !region) unknownRegions.add(area)
    const name = cleanMediaName(r[2])
    const period = parseContractPeriod(r[7])
    const staff = parseStaff(r[5], staffUsers)
    return {
      row: {
        entity: ENTITY,
        code: `M2610${String(i + 1).padStart(4, '0')}`,
        category: str(r[0]),
        regionCity: region?.[0] ?? area,
        regionDistrict: region?.[1] ?? null,
        regionArea: region?.[2] ?? null,
        name,
        nameOriginal: str(r[2]) !== name ? str(r[2]) : null,
        contractType: str(r[6]),
        contractStart: period.start,
        contractEnd: period.end,
        contractNote: str(r[7]),
        staffNote: staff.note,
        runPeriod: str(r[14]),
        status: '운영 중',
        memo: str(r[15]),
        source: Object.fromEntries(all[head].map((h, c) => [String(h).replace(/\s+/g, ' '), r[c] ?? null])),
      },
      prices: PRICE_COLS.flatMap((type, c) => parsePriceCell(r[8 + c]).map((p) => ({ type, ...p }))),
      contacts: parseContacts(r[3], r[4]),
      staffIds: staff.userIds,
      vendors: parseVendors(r[13]),
    }
  })

  const distinct = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))]
  console.log(`매체 ${plan.length}건, 가격 ${plan.reduce((a, p) => a + p.prices.length, 0)}줄, 담당자 ${plan.reduce((a, p) => a + p.contacts.length, 0)}명, 사내담당 연결 ${plan.reduce((a, p) => a + p.staffIds.length, 0)}`)
  console.log('직원 목록에 없는 사내담당:', distinct(plan.map((p) => p.row.staffNote)).join(' / ') || '없음')
  if (unknownRegions.size) console.log('지역 표에 없는 소재지(시 칸에 그대로):', [...unknownRegions].join(', '))
  if (DRY) {
    process.exit(0)
  }

  await db.transaction(async (tx) => {
    // 고를 수 있는 목록 — 이미 있으면 건너뛴다
    const addOption = async (kind: 'category' | 'region' | 'contract_type' | 'vendor' | 'status', value: string, sortOrder: number, parentId: number | null = null) => {
      const [hit] = await tx
        .select({ id: mediaOption.id })
        .from(mediaOption)
        .where(and(eq(mediaOption.entity, ENTITY), eq(mediaOption.kind, kind), eq(mediaOption.value, value), parentId == null ? isNull(mediaOption.parentId) : eq(mediaOption.parentId, parentId)))
        .limit(1)
      if (hit) return hit.id
      const [row] = await tx.insert(mediaOption).values({ entity: ENTITY, kind, value, parentId, sortOrder }).returning({ id: mediaOption.id })
      return row.id
    }
    for (const [i, v] of distinct(plan.map((p) => p.row.category)).entries()) await addOption('category', v, i)
    for (const [i, v] of distinct(plan.map((p) => p.row.contractType)).entries()) await addOption('contract_type', v, i)
    for (const [i, v] of distinct(plan.flatMap((p) => p.vendors.map((x) => x.name))).entries()) await addOption('vendor', v, i)
    for (const [i, v] of MEDIA_STATUSES.entries()) await addOption('status', v, i)
    let order = 0
    for (const p of plan) {
      const { regionCity: c, regionDistrict: d, regionArea: a } = p.row
      if (!c) continue
      const cityId = await addOption('region', c, order++)
      if (!d) continue
      const districtId = await addOption('region', d, order++, cityId)
      if (a) await addOption('region', a, order++, districtId)
    }

    for (const p of plan) {
      const [m] = await tx.insert(media).values(p.row).returning({ id: media.id })
      if (p.prices.length) await tx.insert(mediaPrice).values(p.prices.map((x, i) => ({ mediaId: m.id, type: x.type, label: x.label, amount: x.amount == null ? null : String(x.amount), approx: x.approx, note: x.note, sortOrder: i })))
      if (p.contacts.length) await tx.insert(mediaContact).values(p.contacts.map((x, i) => ({ mediaId: m.id, ...x, sortOrder: i })))
      if (p.staffIds.length) await tx.insert(mediaStaff).values(p.staffIds.map((userId) => ({ mediaId: m.id, userId })))
      if (p.vendors.length) await tx.insert(mediaVendor).values(p.vendors.map((x, i) => ({ mediaId: m.id, name: x.name, note: x.note, sortOrder: i })))
    }
  })
  console.log('import-media done')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
