'use client'

import { useState, useTransition } from 'react'
import { Download, ExternalLink, Paperclip, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { deleteAttachment, listAttachments, uploadAttachment, type AttachmentInfo, type AttachmentTarget } from '@/server/actions/attachments'

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)
const canPreview = (t: string) => t === 'application/pdf' || t.startsWith('image/')

/** 행 옆 첨부 아이콘 → 다이얼로그(목록·업로드·보기·다운로드·삭제) (2026-09-15 피드백) */
export function AttachmentButton({
  targetType,
  targetId,
  title,
  count = 0,
  canEdit,
}: {
  targetType: AttachmentTarget
  targetId: string
  title: string
  count?: number
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AttachmentInfo[] | null>(null)
  const [pending, start] = useTransition()
  const n = items ? items.length : count

  function load() {
    start(async () => setItems(await listAttachments(targetType, targetId)))
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const fd = new FormData()
    fd.set('targetType', targetType)
    fd.set('targetId', targetId)
    fd.set('file', file)
    start(async () => {
      const res = await uploadAttachment(fd)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(`${file.name} 첨부됨`)
      setItems((p) => [...(p ?? []), res.attachment])
    })
  }

  function remove(a: AttachmentInfo) {
    if (!window.confirm(`'${a.filename}' 첨부를 삭제할까요?`)) return
    start(async () => {
      const res = await deleteAttachment(a.id)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setItems((p) => (p ?? []).filter((x) => x.id !== a.id))
    })
  }

  return (
    <>
      <button
        type="button"
        aria-label={`첨부파일 ${n}개`}
        title={n ? `첨부 ${n}개` : '첨부파일'}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] hover:bg-accent/60',
          n ? 'text-foreground' : 'text-muted-foreground/60',
        )}
        onClick={() => {
          setOpen(true)
          if (!items) load()
        }}
      >
        <Paperclip className="size-3.5" />
        {n > 0 && <span className="tabular-nums">{n}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>첨부파일</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {items === null && <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중…</p>}
            {items?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">첨부된 파일이 없습니다</p>}
            {items?.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={a.filename}>
                    {a.filename}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtSize(a.size)} · {a.createdAt.slice(0, 10)}
                    {a.uploadedBy ? ` · ${a.uploadedBy}` : ''}
                  </div>
                </div>
                {canPreview(a.contentType) && (
                  <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" title="새 탭에서 보기" className="rounded-md p-1.5 hover:bg-accent">
                    <ExternalLink className="size-4" />
                  </a>
                )}
                <a href={`/api/attachments/${a.id}?download=1`} title="다운로드" className="rounded-md p-1.5 hover:bg-accent">
                  <Download className="size-4" />
                </a>
                {canEdit && (
                  <button type="button" title="삭제" disabled={pending} className="rounded-md p-1.5 text-destructive hover:bg-accent" onClick={() => remove(a)}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <label className={cn('mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm hover:bg-accent/40', pending && 'pointer-events-none opacity-50')}>
              <Upload className="size-4" />
              {pending ? '처리 중…' : '파일 올리기 (PDF·이미지·문서, 20MB 까지)'}
              <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.txt,.zip" onChange={onFile} disabled={pending} />
            </label>
          )}
          {!canEdit && <p className="text-xs text-muted-foreground">조회 전용 계정은 파일을 올리거나 지울 수 없습니다.</p>}
          <Button variant="ghost" className="justify-self-end" onClick={() => setOpen(false)}>
            닫기
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
