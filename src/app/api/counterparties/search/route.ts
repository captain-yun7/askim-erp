import { NextRequest, NextResponse } from 'next/server'
import { searchCounterparties } from '@/server/queries/counterparties'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const items = await searchCounterparties(q)
  return NextResponse.json({ items })
}
