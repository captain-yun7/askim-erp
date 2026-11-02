import Link from 'next/link'
import { Suspense } from 'react'
import { ListChecks, Plus } from 'lucide-react'
import { RememberList } from '@/components/list-return'
import { MediaBoard } from '@/components/media/media-board'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { canManageLookups, getSessionUser } from '@/server/auth/guards'
import { listMedia } from '@/server/queries/media'

/** 매체관리 (2026-11-02 요청) — 광고매체 엑셀 + 임대인 시트 정리 기준 */
export default async function MediaPage() {
  const [rows, user] = await Promise.all([listMedia(), getSessionUser()])
  const editable = user != null && user.role !== 'viewer'
  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">매체관리</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">광고 매체 기본정보 · 가격 · 담당자 · 계약</p>
        </div>
        <div className="flex items-center gap-2">
          {user && canManageLookups(user.role) && (
            <Link href="/media/options" className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5')}>
              <ListChecks className="size-4" />목록 관리
            </Link>
          )}
          {editable && (
            <Link href="/media/new" className={cn(buttonVariants(), 'gap-1.5')}>
              <Plus className="size-4" />새 매체
            </Link>
          )}
        </div>
      </div>
      <section className="mt-5 overflow-clip rounded-2xl border bg-card">
        <Suspense>
          <RememberList path="/media" />
          <MediaBoard rows={rows} />
        </Suspense>
      </section>
    </div>
  )
}
