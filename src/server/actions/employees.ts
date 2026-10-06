'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { employee } from '@/lib/db/schema'
import { canAccessHr, getSessionUser } from '@/server/auth/guards'
import { audit } from '@/server/audit'

type Result = { ok: true } | { error: string }

async function requireHr(): Promise<{ error: string } | { ok: true }> {
  const user = await getSessionUser()
  if (!user) return { error: '로그인 필요' }
  if (!canAccessHr(user.role)) return { error: '인사관리 권한이 없습니다' }
  return { ok: true }
}

const text = z.string().trim().max(500).optional().nullable()
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
const money = z.coerce.number().finite().min(0).max(100_000_000_000).optional().nullable()

const employeeSchema = z.object({
  name: z.string().trim().min(1, '성함을 입력하세요').max(50),
  position: text,
  birthCode: text,
  department: text,
  hireDate: dateStr,
  annualSalary: money,
  monthlySalary: money,
  incentive: text,
  leaveDate: dateStr,
  pensionYear: z.coerce.number().int().min(1990).max(2100).optional().nullable(),
  memo: text,
})

const LABEL: Record<string, string> = {
  name: '성함', position: '직급', birthCode: '주민번호', department: '부서', hireDate: '입사일', annualSalary: '기본급(연봉)',
  monthlySalary: '월급여', incentive: '인센티브', leaveDate: '퇴사일', pensionYear: '퇴직연금 가입연도', memo: '비고',
}

export async function saveEmployee(id: number | null, raw: unknown): Promise<Result> {
  const guard = await requireHr()
  if ('error' in guard) return guard
  const parsed = employeeSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '검증 실패' }
  const d = parsed.data
  const values = {
    name: d.name,
    position: d.position || null,
    birthCode: d.birthCode || null,
    department: d.department || null,
    hireDate: d.hireDate || null,
    annualSalary: d.annualSalary == null ? null : String(Math.round(d.annualSalary)),
    monthlySalary: d.monthlySalary == null ? null : String(Math.round(d.monthlySalary)),
    incentive: d.incentive || null,
    leaveDate: d.leaveDate || null,
    pensionYear: d.pensionYear ?? null,
    memo: d.memo || null,
  }
  // 감사 로그에는 급여·주민번호 값을 남기지 않고 바뀐 항목 이름만 남긴다
  let changed: string[] = []
  if (id != null) {
    const [before] = await db.select().from(employee).where(eq(employee.id, id)).limit(1)
    if (!before || before.deletedAt) return { error: '대상을 찾을 수 없습니다' }
    changed = (Object.keys(values) as (keyof typeof values)[]).filter((k) => String(before[k] ?? '') !== String(values[k] ?? '')).map((k) => LABEL[k])
    await db.update(employee).set(values).where(eq(employee.id, id))
  } else {
    const [row] = await db.insert(employee).values(values).returning({ id: employee.id })
    id = row.id
  }
  await audit({
    action: 'hr.save',
    targetType: 'employee',
    targetId: id,
    targetLabel: values.name,
    summary: changed.length ? `인사 정보 수정 ${values.name} (${changed.join(', ')})` : `인사 정보 저장 ${values.name}`,
  })
  revalidatePath('/hr')
  return { ok: true }
}

export async function deleteEmployee(id: number): Promise<Result> {
  const guard = await requireHr()
  if ('error' in guard) return guard
  const [row] = await db.update(employee).set({ deletedAt: new Date() }).where(eq(employee.id, id)).returning({ name: employee.name })
  if (!row) return { error: '대상을 찾을 수 없습니다' }
  await audit({ action: 'hr.delete', targetType: 'employee', targetId: id, targetLabel: row.name, summary: `인사 정보 삭제 ${row.name}` })
  revalidatePath('/hr')
  return { ok: true }
}
