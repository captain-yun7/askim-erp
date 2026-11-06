import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { ListBackLink } from '@/components/list-return'
import { MediaForm } from '@/components/media/media-form'
import { getSessionUser } from '@/server/auth/guards'
import { listMediaOptions, listMediaStaffUsers } from '@/server/queries/media'

export default async function NewMediaPage() {
  const user = await getSessionUser()
  if (!user || user.role === 'viewer') redirect('/media')
  const [options, users] = await Promise.all([listMediaOptions(), listMediaStaffUsers()])
  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <ListBackLink path="/media" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" />매체 목록
        </ListBackLink>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">새 매체</h1>
      </div>
      <MediaForm initial={null} options={options} users={users} />
    </div>
  )
}
