/**
 * 매체 엑셀 변환 규칙 점검 — 실제 엑셀에 있던 까다로운 칸들 (2026-11-02)
 *   npx tsx scripts/check-media-parse.ts
 */
import assert from 'node:assert/strict'
import { cleanMediaName, normalizePhone, parseContacts, parseContractPeriod, parsePriceCell, parseStaff, parseVendors } from '@/lib/media-parse'

let n = 0
const eq = (actual: unknown, expected: unknown, name: string) => {
  assert.deepEqual(actual, expected, name)
  n++
}
const p = (raw: string) => parsePriceCell(raw).map((x) => [x.label, x.amount, x.approx, x.note])
const MAN = 10_000

eq(p('2500'), [[null, 2500 * MAN, false, null]], '숫자만 = 만원')
eq(p('정면 3,300만원\r\n측면 3,500만원'), [['정면', 3300 * MAN, false, null], ['측면', 3500 * MAN, false, null]], '면마다 한 줄 (CRLF)')
eq(p('2주 - 1000\n1주 - 500'), [['2주', 1000 * MAN, false, null], ['1주', 500 * MAN, false, null]], '기간 이름')
eq(p('650/1일'), [['1일', 650 * MAN, false, null]], '650/1일')
eq(p('5,000 전후'), [[null, 5000 * MAN, true, null]], '전후')
eq(p('4,000~4,500'), [[null, 4000 * MAN, true, '4,000~4,500']], '범위는 앞 금액 + 메모')
eq(p('1~3번 : 4,500->3,000'), [['1~3번', 3000 * MAN, false, '4,500→3,000']], '화살표 뒤 금액')
eq(p('2+3번 : 2,500'), [['2+3번', 2500 * MAN, false, null]], '2+3번 은 이름')
eq(p('20% 포함가'), [[null, null, false, '20% 포함가']], '금액 없는 줄은 메모로')
eq(p('7675000'), [[null, 7_675_000, false, null]], '큰 숫자는 원')
eq(p('스페이스 100(6,205,000)'), [['스페이스 100', 6_205_000, false, null]], '괄호 속 원')
eq(p('3일 450만원(일150)'), [['3일', 450 * MAN, false, '일150']], '괄호 메모')
eq(p('1,500\n*인상 예정'), [[null, 1500 * MAN, false, '인상 예정']], '* 줄은 앞 줄 메모')
eq(p('2,000만원\n(할인가능)'), [[null, 2000 * MAN, false, '할인가능']], '괄호 줄은 앞 줄 메모')
eq(p('3,500(상단)'), [['상단', 3500 * MAN, false, null]], '금액 뒤 괄호 = 이름')
eq(p('2주 550만원, 1주 200만원'), [['2주', 550 * MAN, false, null], ['1주', 200 * MAN, false, null]], '쉼표로 두 금액')
eq(p('좌측 500\n우측 1000?예상'), [['좌측', 500 * MAN, false, null], ['우측', 1000 * MAN, true, '예상']], '? 예상 = 대략')

eq(normalizePhone('010 5237 2982'), '010-5237-2982', '전화 띄어쓰기')
eq(normalizePhone('01035622984'), '010-3562-2984', '전화 붙여쓰기')
eq(parseContacts('쉐어잇 황태연 부장', '010 3562 2984'), [{ name: '황태연', title: '부장', company: '쉐어잇', phone: '010-3562-2984', phone2: null }], '회사 이름 직함')
eq(parseContacts('큰그림컴퍼니 안샘팀장', null), [{ name: '안샘', title: '팀장', company: '큰그림컴퍼니', phone: null, phone2: null }], '직함이 붙어 있음')
eq(parseContacts('AK 부동산', null), [{ name: null, title: null, company: 'AK 부동산', phone: null, phone2: null }], '회사만')
eq(parseContacts('정원재\r\n기예림', '010-9934-1901\r\n010-7654-9471').map((c) => [c.name, c.phone]), [['정원재', '010-9934-1901'], ['기예림', '010-7654-9471']], '두 사람 두 번호')

eq(parseContractPeriod('26.08.01\r\n~28.07.31(2년)'), { start: '2026-08-01', end: '2028-07-31' }, '계약 날짜')
eq(parseContractPeriod('25. 11 ~ 26. 12'), { start: '2025-11-01', end: '2026-12-31' }, '계약 연월')
eq(parseContractPeriod('26. 12'), { start: null, end: '2026-12-31' }, '끝 연월만')
eq(parseContractPeriod(null), { start: null, end: null }, '빈 계약기간')

eq(parseVendors('진기획 or 스페이스100'), [{ name: '진기획', note: null }, { name: '스페이스100', note: null }], '시공사 둘')
eq(parseVendors('진기획(상단)\r\n가온(하단)'), [{ name: '진기획', note: '상단' }, { name: '가온기획', note: '하단' }], '가온 = 가온기획')
eq(parseStaff('지운, 지호', [{ id: 'a', name: '박지운' }, { id: 'b', name: '강지호' }]), { userIds: ['a', 'b'], note: null }, '사내 담당 이름')
eq(parseStaff('영업팀', [{ id: 'a', name: '박지운' }]), { userIds: [], note: '영업팀' }, '직원 아닌 담당')
eq(cleanMediaName('정연 외벽\r\n정연 옥탑+외벽'), '정연 외벽 / 정연 옥탑+외벽', '두 이름')
eq(cleanMediaName('압구정 166\r\n(리저스_공유오피스)'), '압구정 166 (리저스_공유오피스)', '괄호 이어쓰기')
eq(cleanMediaName('잠실 롯데타워, 롯데월드 \r\n지하 주차장 프로모션'), '잠실 롯데타워, 롯데월드 지하 주차장 프로모션', '이어지는 이름')
console.log(`매체 변환 점검 ${n}개 통과`)
