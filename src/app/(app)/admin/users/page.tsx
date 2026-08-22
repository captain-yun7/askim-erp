import { redirect } from 'next/navigation'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CreateUserDialog } from '@/components/admin/create-user-dialog'
import { UserRow, type AdminUser } from '@/components/admin/user-row'
import { canManageUsers, getSessionUser } from '@/server/auth/guards'

export default async function AdminUsersPage() {
  const user = await getSessionUser()
  if (!user || !canManageUsers(user.role)) redirect('/')

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      team: users.team,
      dealCodePrefix: users.dealCodePrefix,
      isActive: users.isActive,
    })
    .from(users)
    .orderBy(asc(users.name))

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">사용자 관리</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            계정 등록·역할 변경·활성화 관리
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center gap-3.5 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
          총 <b className="text-foreground">{rows.length.toLocaleString()}</b>명
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>팀</TableHead>
                <TableHead>거래코드 prefix</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <UserRow key={r.id} user={r as AdminUser} />
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
