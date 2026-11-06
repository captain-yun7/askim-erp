import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { ListBackLink } from '@/components/list-return'
import { MediaOptionsEditor } from '@/components/media/media-options-editor'
import { canManageLookups, getSessionUser } from '@/server/auth/guards'
import { listMediaOptions } from '@/server/queries/media'

/** 매체 고를 수 있는 목록 — PDF '01 고를 수 있는 목록부터' */
export default async function MediaOptionsPage() {
  const user = await getSessionUser()
  if (!user || !canManageLookups(user.role)) redirect('/media')
  const options = await listMediaOptions()
  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <ListBackLink path="/media" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" />매체 목록
        </ListBackLink>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">매체 목록 관리</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">매체를 입력할 때 고르는 구분·지역·계약종류·시공사·관리 상태</p>
      </div>
      <MediaOptionsEditor options={options} />
    </div>
  )
}
