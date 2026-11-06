/**
 * 귀속월 ↔ 입금예정일 함께 바꾸기 (2026-11-05 요청)
 *   귀속 11월로 바꾸면 → 입금예정일도 11월(일은 그대로, 그 달에 없으면 말일)
 *   입금예정일 11/30 으로 바꾸면 → 귀속도 11월
 * 입금예정일이 비어 있으면 귀속만 바꾸고 날짜를 새로 만들지 않는다.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** 귀속연월이 바뀌었을 때 맞춰 옮긴 입금예정일 (옮길 필요 없으면 원래 값) */
export function dueDateForAccrual(due: string | null | undefined, year: number, month: number): string | null {
  if (!due) return due ?? null
  const m = ISO.exec(due)
  if (!m || !Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return due
  if (Number(m[1]) === year && Number(m[2]) === month) return due
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(Number(m[3]), lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 입금예정일에 맞춘 귀속연월 (날짜가 비었거나 이상하면 null) */
export function accrualForDueDate(due: string | null | undefined): { year: number; month: number } | null {
  const m = due ? ISO.exec(due) : null
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null
}
