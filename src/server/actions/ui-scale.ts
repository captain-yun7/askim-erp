'use server'

import { cookies } from 'next/headers'
import { UI_SCALE_COOKIE, parseUiScale } from '@/lib/ui-scale'

export async function setUiScaleAction(value: string) {
  const scale = parseUiScale(value)
  const jar = await cookies()
  jar.set(UI_SCALE_COOKIE, scale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return { ok: true, scale }
}
