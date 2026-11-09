import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { ListBackLink } from '@/components/list-return'
import { MediaForm } from '@/components/media/media-form'
import { getSessionUser } from '@/server/auth/guards'
import { canEditMedia } from '@/server/media-access'
import { getMedia, listMediaOptions, listMediaStaffUsers } from '@/server/queries/media'

export default async function MediaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const [m, user, options, users] = await Promise.all([getMedia(Number(id)), getSessionUser(), listMediaOptions(), listMediaStaffUsers()])
  if (!m) notFound()
  const readOnly = !(await canEditMedia(user))
  return (
    <div>
      <div className="border-b px-8 pb-4 pt-6">
        <ListBackLink path="/media" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" />매체 목록
        </ListBackLink>
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">{readOnly ? '매체 상세' : '매체 수정'}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="font-mono">{m.code}</span> · {m.name}
        </p>
      </div>
      <MediaForm initial={m} options={options} users={users} readOnly={readOnly} />
    </div>
  )
}
