import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ContractTable, DepositTable } from '@/components/deposits/deposit-tables'
import { getSessionUser } from '@/server/auth/guards'
import { listDeposits, listExclusiveContracts } from '@/server/queries/deposits'
import { formatKRW } from '@/lib/format'

export default async function DepositsPage() {
  const [deposits, contracts, user] = await Promise.all([
    listDeposits(),
    listExclusiveContracts(),
    getSessionUser(),
  ])
  const editable = user != null && user.role !== 'viewer'

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">보증금·전속계약</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            영업 보증금 관리 · 국내 전속매체 계약사항
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

      <Tabs defaultValue="deposits" className="mt-5">
        <TabsList>
          <TabsTrigger value="deposits">보증금현황 ({deposits.count})</TabsTrigger>
          <TabsTrigger value="contracts">전속매체 계약사항 ({contracts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="deposits">
          <section className="overflow-hidden rounded-xl border bg-card">
            <DepositTable rows={deposits.rows} editable={editable} />
          </section>
        </TabsContent>
        <TabsContent value="contracts">
          <section className="overflow-hidden rounded-xl border bg-card">
            <ContractTable rows={contracts} editable={editable} />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
