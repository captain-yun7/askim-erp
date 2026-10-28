import { DepositBoard } from '@/components/deposits/deposit-tables'
import { getSessionUser } from '@/server/auth/guards'
import { resolveDealScope } from '@/server/auth/deal-scope'
import { listDeposits, listExclusiveContracts } from '@/server/queries/deposits'
import { getAttachmentCounts } from '@/server/actions/attachments'
import { formatKRW } from '@/lib/format'

export default async function DepositsPage() {
  const user = await getSessionUser()
  const [deposits, contracts] = await Promise.all([listDeposits(user), listExclusiveContracts(user)])
  const [depositAtt, contractAtt] = await Promise.all([
    getAttachmentCounts('deposit', deposits.rows.map((r) => String(r.id))),
    getAttachmentCounts('contract', contracts.map((r) => String(r.id))),
  ])
  const editable = user != null && user.role !== 'viewer'
  const scope = user ? await resolveDealScope(user) : null

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">보증금·전속계약·보유자산</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            영업 보증금 관리 · 국내 전속매체 계약사항 · 보유자산 현황
            {scope?.kind === 'own' && ' · 본인 담당 건만 표시'}
            {scope?.kind === 'team' && ` · ${scope.teams.join('·')} 담당 건만 표시`}
          </p>
        </div>
        <div className="flex gap-6 rounded-xl border bg-card px-5 py-3 text-[12.5px]">
          <div>
            <div className="text-muted-foreground">보증금 총액</div>
            <div className="font-mono text-[15px] font-semibold tabular-nums">
              ₩ {formatKRW(deposits.total)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">미회수 (반환 전)</div>
            <div className="font-mono text-[15px] font-semibold text-destructive tabular-nums">
              ₩ {formatKRW(deposits.outstanding)}
              <span className="ml-1 text-[11.5px] font-normal text-muted-foreground">
                {deposits.outstandingCount}건
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 탭으로 나누지 않고 한 표로 (2026-10-23 요청) */}
      <section className="mt-5 overflow-hidden rounded-xl border bg-card">
        <DepositBoard
          deposits={deposits.rows}
          contracts={contracts}
          editable={editable}
          depositAttachments={depositAtt}
          contractAttachments={contractAtt}
        />
      </section>
    </div>
  )
}
