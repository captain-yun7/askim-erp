import { eq } from 'drizzle-orm'
import { get } from '@vercel/blob'
import { db } from '@/lib/db/client'
import { attachment } from '@/lib/db/schema'
import { getSessionUser } from '@/server/auth/guards'

/** 비공개 첨부 제공 — 로그인 사용자만. 기본 inline(브라우저 뷰어), ?download=1 이면 다운로드 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('로그인 필요', { status: 401 })
  const { id } = await ctx.params
  const [row] = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1)
  if (!row) return new Response('없음', { status: 404 })

  const res = await get(row.blobUrl, { access: 'private' })
  if (!res || res.statusCode !== 200) return new Response('파일을 읽을 수 없습니다', { status: 502 })

  const download = new URL(req.url).searchParams.get('download') === '1'
  const encoded = encodeURIComponent(row.filename)
  return new Response(res.stream, {
    headers: {
      'content-type': row.contentType,
      'content-length': String(row.size),
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encoded}`,
      'cache-control': 'private, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  })
}
