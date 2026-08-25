import { redirect } from 'next/navigation'
import { requireBackoffice } from '@/server/auth/require-backoffice'

export default async function ReportsPage() {
  await requireBackoffice()

  redirect('/reports/ledger')
}
