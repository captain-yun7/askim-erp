import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AuditFilters } from '@/components/admin/audit-filters'
import { AUDIT_ACTION_LABEL } from '@/server/audit'
import { canManageUsers, getSessionUser } from '@/server/auth/guards'
import { listAuditLogs, listAuditUsers } from '@/server/queries/audit-log'
import { cn } from '@/lib/utils'

type SP = { [k: string]: string | string[] | undefined }
const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined)

const FIELD_LABEL: Record<string, string> = {
  dealCode: '거래코드', accrualYear: '귀속연도', accrualMonth: '귀속월', ownerUserId: '담당자', categoryId: '상품구분', accountId: '계정항목', currency: '통화', status: '상태',
  salesMethodId: '매출수단', issuerCounterpartyId: '발행처', advertiserName: '실광고주', itemName: '품목명', adStart: '광고 시작', adEnd: '광고 종료',
  salesAmountNet: '매출금', salesVat: '매출 부가세', salesAmountGross: '총매출', salesDueDate: '입금예정일', salesPaidDate: '입금일', salesPaidStatus: '입금여부', salesInvoiceDate: '매출 계산서 발행일', salesMemo: '매출 비고',
  supplierCounterpartyId: '매체사', settlementYear: '결산연도', settlementMonth: '결산월', purchasePricingRaw: '수수료',
  purchaseAmountNet: '매입금', purchaseVat: '매입 부가세', purchaseAmountGross: '총매입', purchaseDueDate: '결산예정일', purchasePaidDate: '지급일', purchasePaidStatus: '결산여부', purchaseInvoiceDate: '매입 계산서 발행일', purchaseMemo: '매입 비고',
  name: '상호명', businessNo: '사업자번호', ceo: '대표자', address: '주소', phone: '전화', email: '이메일', contactPerson: '담당자', bankName: '은행', accountNo: '계좌번호', accountHolder: '예금주', officialFeeRate: '공식 수수료', unofficialFeeRate: '비공식 수수료', paymentTerm: '결제조건', memo: '메모', roleTags: '역할',
}

const fmtAt = (d: Date) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d)

function DetailView({ detail }: { detail: unknown }) {
  if (detail == null) return null
  if (typeof detail === 'object' && !Array.isArray(detail)) {
    const entries = Object.entries(detail as Record<string, unknown>)
    if (entries.length === 0) return null
    const isDiff = entries.every(([, v]) => Array.isArray(v) && v.length === 2)
    return (
      <div className="grid gap-0.5 text-[11.5px] text-muted-foreground">
        {entries.slice(0, 40).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="w-32 shrink-0 text-foreground/70">{FIELD_LABEL[k] ?? k}</span>
            {isDiff ? (
              <span>
                <span className="line-through">{String((v as unknown[])[0] ?? '-')}</span> → <span className="text-foreground">{String((v as unknown[])[1] ?? '-')}</span>
              </span>
            ) : (
              <span className="break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}</span>
            )}
          </div>
        ))}
      </div>
    )
  }
  return <pre className="max-h-40 overflow-auto text-[11px] text-muted-foreground">{JSON.stringify(detail, null, 1)}</pre>
}

/** 감사 로그 — 모든 사용자 행위의 일시·주체·대상 (관리자 전용, 2026-09-15 요구) */
export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await getSessionUser()
  if (!me || !canManageUsers(me.role)) redirect('/')
  const sp = await searchParams
  const filters = { from: str(sp.from), to: str(sp.to), userId: str(sp.user), action: str(sp.action), q: str(sp.q), page: sp.page ? parseInt(String(sp.page), 10) : 1 }
  const [{ rows, total, page, pageSize }, users] = await Promise.all([listAuditLogs(filters), listAuditUsers()])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const qs = (p: number) => {
    const n = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && v && k !== 'page') n.set(k, v)
    n.set('page', String(p))
    return `/admin/audit?${n.toString()}`
  }

  return (
    <div className="flex flex-col px-8 pb-8 pt-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin" className="mb-1 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3.5" />관리자
          </Link>
          <h1 className="text-[28px] font-normal leading-tight tracking-[-0.01em]">감사 로그</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">누가 언제 무엇을 했는지 — 로그인·등록·수정·삭제·내보내기·첨부 열람 전부 기록됩니다 (한국 시간)</p>
        </div>
      </div>

      <section className="mt-5 overflow-clip rounded-2xl border bg-card">
        <div className="border-b p-4">
          <AuditFilters users={users.map((u) => ({ id: u.userId!, name: u.userName }))} actions={AUDIT_ACTION_LABEL} initial={filters} />
        </div>
        <div className="flex items-center gap-3.5 border-b px-4 py-2.5 text-[12.5px] text-muted-foreground">
          총 <b className="text-foreground">{total.toLocaleString()}</b>건
          <span className="ml-auto">
            {page} / {totalPages} 페이지
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-44 pl-4">일시</TableHead>
              <TableHead className="w-28">사용자</TableHead>
              <TableHead className="w-36">행위</TableHead>
              <TableHead>내용</TableHead>
              <TableHead className="w-28 pr-4">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-14 text-center text-sm text-muted-foreground">
                  조건에 맞는 기록이 없습니다
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="align-top hover:bg-muted/40">
                <TableCell className="pl-4 font-mono text-xs tabular-nums text-muted-foreground">{fmtAt(r.at)}</TableCell>
                <TableCell className="text-[13px]">
                  {r.userName ?? <span className="text-muted-foreground">-</span>}
                  {r.userRole && <div className="text-[11px] text-muted-foreground">{r.userRole}</div>}
                </TableCell>
                <TableCell>
                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium', r.action.startsWith('auth.login_failed') ? 'bg-destructive/10 text-destructive' : r.action.endsWith('.delete') ? 'bg-accent text-accent-foreground' : 'bg-info text-info-foreground')}>
                    {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                  </span>
                </TableCell>
                <TableCell className="text-[13px]">
                  <div>{r.summary}</div>
                  {r.detail != null && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11.5px] text-muted-foreground hover:text-foreground">상세</summary>
                      <div className="mt-1 rounded-md bg-muted/40 p-2">
                        <DetailView detail={r.detail} />
                      </div>
                    </details>
                  )}
                </TableCell>
                <TableCell className="pr-4 font-mono text-[11px] text-muted-foreground">{r.ip ?? '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-end gap-1 px-4 py-3">
          <Link aria-disabled={page <= 1} href={qs(Math.max(1, page - 1))} className={cn('grid size-7 place-items-center rounded-md border bg-card text-xs', page <= 1 && 'pointer-events-none opacity-40')}>
            <ChevronLeft className="size-3.5" />
          </Link>
          <Link aria-disabled={page >= totalPages} href={qs(Math.min(totalPages, page + 1))} className={cn('grid size-7 place-items-center rounded-md border bg-card text-xs', page >= totalPages && 'pointer-events-none opacity-40')}>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </div>
  )
}
