import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

// 첨부파일 (2026-09-15 피드백: 계약서 업로드·뷰어) — 파일 본문은 Vercel Blob(private), 메타만 DB
export const attachment = pgTable(
  'attachment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** deposit | contract(전속·보유자산) | deal */
    targetType: text('target_type', { enum: ['deposit', 'contract', 'deal'] }).notNull(),
    targetId: text('target_id').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    /** Blob URL (private — 직접 접근 불가, /api/attachments/[id] 로만 제공) */
    blobUrl: text('blob_url').notNull(),
    blobPathname: text('blob_pathname').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachment_target_idx').on(t.targetType, t.targetId)],
)

export type Attachment = typeof attachment.$inferSelect
