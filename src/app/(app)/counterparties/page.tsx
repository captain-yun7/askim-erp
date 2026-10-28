import Link from 'next/link'
import { RememberList } from '@/components/list-return'
import { Plus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { XlsxExportButton } from '@/components/xlsx-export-button'
import { exportCounterpartiesXlsx } from '@/server/actions/export'
import { listCounterparties } from '@/server/queries/counterparties'
import { getAttachmentCounts } from '@/server/actions/attachments'
import { CounterpartiesTable } from '@/components/counterparties/counterparties-table'
import { CounterpartiesFilters } from '@/components/counterparties/counterparties-filters'
import { cn } from '@/lib/utils'
import { canCreateCounterparty, canDeleteCounterparty, canViewBankInfo, getSessionUser } from '@/server/auth/guards'

export default async function CounterpartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  // 같은 이름이 두 번 오면(?q=a&q=b) 배열이 된다 — 글자 하나만 받는다
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
  const [q, role, noBiz, ctype] = [str(sp.q), str(sp.role), str(sp.noBiz), str(sp.ctype)]
  const user = await getSessionUser()
  const showBank = user ? canViewBankInfo(user.role) : false
  const rows = await listCounterparties({ q, role, noBiz: Boolean(noBiz), ctype })

  // 첨부 개수 (2026-10-08: 사업자등록증·통장사본)
  const attachmentCounts = await getAttachmentCounts('counterparty', rows.map((r) => r.id))
  const rowsWithAttachments = rows.map((r) => ({ ...r, attachmentCount: attachmentCounts[r.id] ?? 0 }))

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">거래처</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            매체사·광고주·대행사 통합 마스터
          </p>
        </div>
        <div className="flex items-center gap-2">
          <XlsxExportButton action={exportCounterpartiesXlsx} filters={{ q, role, noBiz: Boolean(noBiz), ctype }} label="엑셀 내보내기" />
          {user && canCreateCounterparty(user.role) && (
            <Link
              href="/counterparties/new"
              className={cn(buttonVariants(), 'gap-1.5')}
            >
              <Plus className="size-4" />새 거래처
            </Link>
          )}
        </div>
      </div>

      {/* overflow-hidden 이면 선택 줄이 화면에 붙지 않는다(sticky) — clip 은 모서리만 자르고 붙음은 살린다 (2026-10-28) */}
      <section className="mt-5 overflow-clip rounded-2xl border bg-card">
        <div className="border-b p-4">
          <RememberList path="/counterparties" />
          <CounterpartiesFilters initial={{ q, role, noBiz: Boolean(noBiz), ctype }} />
        </div>

        <div className="flex items-center gap-3.5 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
          총 <b className="text-foreground">{rows.length.toLocaleString()}</b>건
        </div>

        <CounterpartiesTable rows={rowsWithAttachments} showBank={showBank} canDelete={user != null && canDeleteCounterparty(user.role)} canEdit={user != null && user.role !== 'viewer'} />
      </section>
    </div>
  )
}
