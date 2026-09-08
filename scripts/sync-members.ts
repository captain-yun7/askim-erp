import './_env'
import { randomInt } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { eq, inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

/**
 * 고객 구성원 명단(2026-09-07 '에스킴컴퍼니 구성원 계정.xlsx') → users 동기화
 *
 *   npx tsx scripts/sync-members.ts --domain askim.co.kr [--apply] [--reset-all] [--out path.csv]
 *
 * - 이름으로 기존 계정을 찾아 이메일·역할·팀·팀장·활성 갱신, 없으면 신규 생성
 * - 신규 계정(과 --reset-all 시 전원)에 임시 비밀번호 발급 → CSV 로 출력 (고객 전달용)
 * - 명단에 없는 기존 계정은 비활성화 (시스템 admin 계정은 유지)
 * - --apply 없으면 dry-run
 */

type Row = { name: string; id: string; role: 'admin' | 'sales'; team: string | null; lead: boolean; prefix?: string }

// 권한 빈칸(이나린·윤도경)은 팀원으로 가정 — 고객 확인 후 변경
const ROSTER: Row[] = [
  { name: '강지호', id: 'jiho', role: 'admin', team: '본부', lead: false, prefix: 'AH' },
  { name: '박지운', id: 'jiwoon', role: 'admin', team: '본부', lead: false, prefix: 'AW' },
  { name: '장은정', id: 'ejjang', role: 'admin', team: '경영지원', lead: false },
  { name: '이유정', id: 'yjlee', role: 'admin', team: '경영지원', lead: false, prefix: 'AY' },
  { name: '이나린', id: 'rincredible', role: 'sales', team: '콘텐츠팀', lead: false, prefix: 'AN' },
  { name: '윤도경', id: 'dogyeong', role: 'sales', team: '전략기획', lead: false },
  { name: '김형준', id: 'hyungjun', role: 'sales', team: '국내영업', lead: true, prefix: 'AZ' },
  { name: '최현정', id: 'hjchoe', role: 'sales', team: '국내영업', lead: false, prefix: 'AC' },
  { name: '이명철', id: 'leemc0623', role: 'sales', team: '국내영업', lead: false, prefix: 'AM' },
  { name: '신승환', id: 'seunghwan', role: 'sales', team: '국내영업', lead: false },
  { name: '유찬영', id: 'chanyoung.you', role: 'sales', team: '국내영업', lead: false, prefix: 'AU' },
  { name: '오혁', id: 'hyeok', role: 'sales', team: '국내영업', lead: false, prefix: 'AO' },
  { name: '김도형', id: 'dohyung', role: 'sales', team: '국내영업', lead: false },
  { name: '박귀정', id: 'chris', role: 'sales', team: '해외영업', lead: true },
  { name: '장휘', id: 'huizhang9876', role: 'sales', team: '해외영업', lead: false },
  { name: '오수민', id: 'ohsumin0116', role: 'sales', team: '해외영업', lead: false },
  { name: '김우빈', id: 'woobin', role: 'sales', team: '해외영업', lead: false },
]

/** 명단에 없어도 유지할 계정 (시스템/운영용) */
const KEEP = ['admin@askim.local']

const TEMP_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
const tempPassword = () => Array.from({ length: 10 }, () => TEMP_CHARS[randomInt(TEMP_CHARS.length)]).join('')

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (name: string) => process.argv.includes(`--${name}`)

async function main() {
  const domain = arg('domain')
  if (!domain) throw new Error('--domain 필요 (예: --domain askim.co.kr)')
  const apply = has('apply')
  const resetAll = has('reset-all')
  const out = arg('out') ?? `_docs/specs/feedback/20260907/계정목록_임시비밀번호_${new Date().toISOString().slice(0, 10)}.csv`

  const existing = await db.select().from(users)
  const byName = new Map(existing.map((u) => [u.name, u]))
  const csv: string[][] = [['이름', '소속', '권한', '로그인 이메일', '임시 비밀번호', '비고']]
  const log = (s: string) => console.log((apply ? '' : '[dry-run] ') + s)

  for (const r of ROSTER) {
    const email = `${r.id}@${domain}`.toLowerCase()
    const roleLabel = r.role === 'admin' ? '관리자' : r.lead ? '팀장' : '팀원'
    const cur = byName.get(r.name)
    if (cur) {
      const needPw = resetAll
      const pw = needPw ? tempPassword() : null
      log(`갱신 ${r.name}: ${cur.email} → ${email}, ${cur.role}→${r.role}, 팀 ${cur.team}→${r.team}, 팀장 ${cur.isTeamLead}→${r.lead}${pw ? ', 비번 초기화' : ''}`)
      if (apply)
        await db
          .update(users)
          .set({
            email,
            role: r.role,
            team: r.team,
            isTeamLead: r.lead,
            isActive: true,
            dealCodePrefix: r.prefix ?? cur.dealCodePrefix,
            ...(pw ? { passwordHash: await bcrypt.hash(pw, 10) } : {}),
          })
          .where(eq(users.id, cur.id))
      csv.push([r.name, r.team ?? '', roleLabel, email, pw ?? '(기존 비밀번호 유지)', '기존 계정'])
    } else {
      const pw = tempPassword()
      log(`신규 ${r.name}: ${email} ${r.role} ${r.team} 팀장=${r.lead}`)
      if (apply)
        await db.insert(users).values({
          name: r.name,
          email,
          passwordHash: await bcrypt.hash(pw, 10),
          role: r.role,
          team: r.team,
          isTeamLead: r.lead,
          dealCodePrefix: r.prefix ?? null,
        })
      csv.push([r.name, r.team ?? '', roleLabel, email, pw, '신규'])
    }
  }

  const rosterNames = new Set(ROSTER.map((r) => r.name))
  const toDeactivate = existing.filter((u) => !rosterNames.has(u.name) && !KEEP.includes(u.email) && u.isActive)
  for (const u of toDeactivate) log(`비활성화 ${u.name} (${u.email}) — 명단에 없음`)
  if (apply && toDeactivate.length)
    await db.update(users).set({ isActive: false }).where(inArray(users.id, toDeactivate.map((u) => u.id)))

  const csvText = '﻿' + csv.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  if (apply) {
    writeFileSync(out, csvText)
    console.log(`\nCSV 저장: ${out} (고객 전달 후 삭제 권장)`)
  } else console.log('\n--apply 를 붙이면 실제 반영 + CSV 저장')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
