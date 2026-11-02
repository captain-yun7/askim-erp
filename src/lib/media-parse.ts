/**
 * 매체 엑셀(광고매체_회사보관용_v2) 한 칸에 섞여 적힌 값을 줄 단위로 나눈다 (2026-11-02 매체관리).
 * 못 알아본 내용은 버리지 않고 note 에 남긴다.
 */

export type ParsedPrice = { label: string | null; amount: number | null; approx: boolean; note: string | null }
export type ParsedContact = { name: string | null; title: string | null; company: string | null; phone: string | null; phone2: string | null }

const MAN = 10_000

/** 숫자 뒤에 붙으면 금액이 아니라 면·기간 이름 */
const LABEL_UNIT = /^\s*(번|주|일|면|년차|개월|층|호|차)/

type Num = { value: number; won: boolean; start: number; end: number }

function numbersOutsideParens(s: string): Num[] {
  const out: Num[] = []
  let depth = 0
  const re = /\d[\d,]*(?:\.\d+)?/g
  let m: RegExpExecArray | null
  let last = 0
  while ((m = re.exec(s))) {
    for (const ch of s.slice(last, m.index)) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    last = m.index
    if (depth > 0) continue
    const before = s[m.index - 1] ?? ''
    if (/[A-Za-z가-힣]/.test(before) && !/[원만]/.test(before)) continue // 일150, M2 같은 붙은 숫자
    const rest = s.slice(m.index + m[0].length)
    if (LABEL_UNIT.test(rest) || /^\s*%/.test(rest)) continue
    // 1~3번, 2+3번 처럼 뒤 숫자에 단위가 붙으면 앞 숫자도 이름
    const range = rest.match(/^\s*[~+]\s*\d[\d,]*/)
    if (range && LABEL_UNIT.test(rest.slice(range[0].length))) continue
    const unit = rest.match(/^\s*(만원|만|원)/)?.[1]
    const raw = Number(m[0].replace(/,/g, ''))
    const won = unit === '원' || (!unit && raw >= 100_000)
    out.push({ value: raw, won, start: m.index, end: m.index + m[0].length + (rest.match(/^\s*(만원|만|원)/)?.[0].length ?? 0) })
  }
  return out
}

const clean = (s: string) =>
  s
    .replace(/^[\s\-:/_,·~]+|[\s\-:/_,·~]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const unparen = (s: string) => s.replace(/^\((.*)\)$/, '$1').trim()

function parseLine(line: string): ParsedPrice {
  let s = line.trim()
  let approx = false
  const notes: string[] = []
  if (/전후/.test(s)) {
    approx = true
    s = s.replace(/\s*전후\s*/g, ' ').trim()
  }
  if (/\?|예상/.test(s)) approx = true

  // 괄호 안에 원 단위 큰 금액: 스페이스 100(6,205,000)
  const wonParen = s.match(/\((\d{1,3}(?:,\d{3}){2,})\)/)
  if (wonParen) {
    return { label: clean(s.replace(wonParen[0], '')) || null, amount: Number(wonParen[1].replace(/,/g, '')), approx, note: null }
  }

  const nums = numbersOutsideParens(s)
  if (!nums.length) return { label: null, amount: null, approx, note: s || null }

  let pick = nums[0]
  // 4,500->3,000 / 500만원 → 900만원 : 화살표 뒤 금액
  const arrow = nums.findIndex((n, i) => i > 0 && /->|→/.test(s.slice(nums[i - 1].end, n.start)))
  if (arrow > 0) {
    const from = nums[arrow - 1]
    notes.push(clean(s.slice(from.start, nums[arrow].end)).replace(/\s*(->|→)\s*/g, '→'))
    // 앞 금액과 화살표를 지우고 뒤 금액으로 다시 읽는다
    s = s.slice(0, from.start) + s.slice(nums[arrow].start)
    return finish(s, numbersOutsideParens(s)[0], approx, notes)
  }
  // 4,000~4,500 : 앞 금액, 범위는 메모
  const after = s.slice(pick.end)
  const range = after.match(/^\s*~\s*(\d[\d,]*)\s*(만원|만|원)?/)
  if (range) {
    approx = true
    notes.push(clean(s.slice(pick.start, pick.end + range[0].length)))
    s = s.slice(0, pick.end) + s.slice(pick.end + range[0].length)
  }
  return finish(s, pick, approx, notes)
}

function finish(s: string, pick: Num, approx: boolean, notes: string[]): ParsedPrice {
  const amount = Math.round(pick.won ? pick.value : pick.value * MAN)
  const before = clean(s.slice(0, pick.start))
  let tail = clean(s.slice(pick.end))
  if (/^예상/.test(tail) || /^\?/.test(tail)) tail = clean(tail.replace(/^\?/, ''))
  let label = before || null
  if (tail) {
    // 금액 뒤 괄호 하나뿐이면 — 이름이 없을 땐 이름(3,500(상단)), 있으면 메모
    if (!label) label = /^\([^()]*\)$/.test(tail) ? unparen(tail) : tail
    else notes.push(unparen(tail))
  }
  const note = notes.filter(Boolean).join(' · ') || null
  return { label: label ? label.replace(/\s*-\s*/g, ' ').trim() : null, amount, approx, note }
}

/** 가격 칸 하나 → 줄 여러 개 */
export function parsePriceCell(raw: unknown): ParsedPrice[] {
  if (raw == null || String(raw).trim() === '') return []
  const out: ParsedPrice[] = []
  const lines = String(raw)
    .split(/\r?\n/)
    .flatMap((l) => {
      // "2주 550만원, 1주 200만원" — 쉼표 뒤 띄어 쓴 두 금액은 두 줄
      const parts = l.split(/,\s+/)
      return parts.length > 1 && parts.every((p) => numbersOutsideParens(p).length > 0) ? parts : [l]
    })
    .map((l) => l.trim())
    .filter(Boolean)
  for (const line of lines) {
    const prev = out[out.length - 1]
    // "*인상 예정", "(할인가능)" 처럼 앞 줄에 붙는 설명
    if (prev && (/^\*/.test(line) || /^\([^)]*\)$/.test(line))) {
      const add = unparen(line.replace(/^\*/, '').trim())
      prev.note = prev.note ? `${prev.note} · ${add}` : add
      continue
    }
    out.push(parseLine(line))
  }
  return out
}

const TITLES = ['부대표', '본부장', '대표님', '팀장님', '대표', '이사', '부장', '팀장', '상무', '실장', '차장', '사장', '매니저', '과장', '대리']
const COMPANY_HINT = /부동산|미디어|컴퍼니|코퍼레이션|커뮤니케이션|애드|기획|위아|^AK$/

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  if (/^01\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (/^01\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  if (/^02\d{7,8}$/.test(d)) return `02-${d.slice(2, d.length - 4)}-${d.slice(-4)}`
  if (/^0\d{9,10}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`
  return raw.trim() || null
}

function parsePerson(text: string): Omit<ParsedContact, 'phone' | 'phone2'> {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  let title: string | null = null
  const last = tokens[tokens.length - 1] ?? ''
  const bracket = last.match(/(\[.*\])$/)?.[1] ?? ''
  const lastBare = bracket ? last.slice(0, -bracket.length) : last
  const hit = TITLES.find((t) => lastBare === t || (lastBare.endsWith(t) && lastBare.length > t.length))
  if (hit) {
    title = hit
    const rest = lastBare.slice(0, -hit.length)
    tokens.pop()
    if (rest) tokens.push(rest)
  }
  if (!tokens.length) return { name: null, title, company: null }
  if (title && tokens.length >= 2) {
    const name = tokens.pop()!
    return { name: name + (bracket ? ` ${bracket}` : ''), title, company: tokens.join(' ') }
  }
  const joined = tokens.join(' ')
  if (!title && COMPANY_HINT.test(joined)) return { name: null, title, company: joined }
  if (!title && tokens.length >= 2) return { name: null, title, company: joined }
  return { name: joined + (bracket ? ` ${bracket}` : ''), title, company: null }
}

/** 매체 담당자 칸 + 연락처 칸 → 사람마다 한 줄 */
export function parseContacts(nameRaw: unknown, phoneRaw: unknown): ParsedContact[] {
  const names = String(nameRaw ?? '')
    .split(/\r?\n|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  const phones = String(phoneRaw ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!names.length && !phones.length) return []
  const people = names.length ? names : ['']
  return people.map((n, i) => ({
    ...parsePerson(n),
    phone: normalizePhone(phones[i] ?? null),
    phone2: i === people.length - 1 && phones.length > people.length ? normalizePhone(phones.slice(people.length).join(' ')) : null,
  }))
}

const yy = (s: string) => 2000 + Number(s)
const pad = (n: number) => String(n).padStart(2, '0')
const monthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`

/** 계약기간 원문 → 시작일·끝나는 날 (못 읽으면 null) */
export function parseContractPeriod(raw: unknown): { start: string | null; end: string | null } {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return { start: null, end: null }
  const full = [...s.matchAll(/(\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})/g)]
  if (full.length >= 2) {
    const [a, b] = full
    return { start: `${yy(a[1])}-${pad(+a[2])}-${pad(+a[3])}`, end: `${yy(b[1])}-${pad(+b[2])}-${pad(+b[3])}` }
  }
  const ym = [...s.matchAll(/(\d{2})\.\s*(\d{1,2})(?!\s*\.\s*\d)/g)]
  if (ym.length >= 2) return { start: `${yy(ym[0][1])}-${pad(+ym[0][2])}-01`, end: monthEnd(yy(ym[1][1]), +ym[1][2]) }
  if (ym.length === 1) return { start: null, end: monthEnd(yy(ym[0][1]), +ym[0][2]) }
  return { start: null, end: null }
}

/** 엑셀 소재지 → 시 · 구 · 동네 (PDF: 서울 → 성동구 → 성수, 한남/한남동은 하나로) */
export const REGION_OF: Record<string, [string, string | null, string | null]> = {
  성수: ['서울', '성동구', '성수'],
  홍대: ['서울', '마포구', '홍대'],
  명동: ['서울', '중구', '명동'],
  신당동: ['서울', '중구', '신당동'],
  중구: ['서울', '중구', null],
  압구정: ['서울', '강남구', '압구정'],
  압구정로데오: ['서울', '강남구', '압구정로데오'],
  가로수길: ['서울', '강남구', '가로수길'],
  강남: ['서울', '강남구', null],
  송파구: ['서울', '송파구', null],
  한남: ['서울', '용산구', '한남동'],
  한남동: ['서울', '용산구', '한남동'],
  용리단: ['서울', '용산구', '용리단길'],
  북촌: ['서울', '종로구', '북촌'],
  종로: ['서울', '종로구', null],
  종로구: ['서울', '종로구', null],
  서순라길: ['서울', '종로구', '서순라길'],
  신촌: ['서울', '서대문구', '신촌'],
  새빛섬: ['서울', '서초구', '새빛섬'],
  부산: ['부산', null, null],
}

/** 시공사 이름 통일 (PDF: 가온/가온기획은 같은 회사) */
export const VENDOR_ALIAS: Record<string, string> = { 가온: '가온기획', '스페이스 100': '스페이스100' }

export function parseVendors(raw: unknown): { name: string; note: string | null }[] {
  return String(raw ?? '')
    .split(/\r?\n|\s+or\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
      const name = (m ? m[1] : s).trim()
      return { name: VENDOR_ALIAS[name] ?? name, note: m ? m[2].trim() : null }
    })
}

/** 사내 담당 칸 → 직원(이름 끝 두 글자로 맞춤) + 직원이 아닌 것 */
export function parseStaff(raw: unknown, users: { id: string; name: string }[]): { userIds: string[]; note: string | null } {
  const ids: string[] = []
  const rest: string[] = []
  for (const t of String(raw ?? '').split(/,\s*|\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    const hits = users.filter((u) => u.name === t || (u.name.length === t.length + 1 && u.name.endsWith(t)))
    if (hits.length === 1) ids.push(hits[0].id)
    else rest.push(t)
  }
  return { userIds: [...new Set(ids)], note: rest.join(', ') || null }
}

/** 매체명 칸 — 줄바꿈은 이어 쓰기, 두 이름이면 ' / ' */
export function cleanMediaName(raw: unknown): string {
  const lines = String(raw ?? '').split(/\r?\n/)
  let out = lines[0].trim()
  for (let i = 1; i < lines.length; i++) {
    const next = lines[i].trim()
    if (!next) continue
    out += next.startsWith('(') || /\s$/.test(lines[i - 1]) ? ` ${next}` : ` / ${next}`
  }
  return out.replace(/\s+/g, ' ').trim()
}
