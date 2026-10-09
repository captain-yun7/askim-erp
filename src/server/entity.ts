import { cookies } from 'next/headers'
import { cache } from 'react'
import { DEFAULT_ENTITY, ENTITY_COOKIE, isEntity, type Entity } from '@/lib/entity'

/**
 * 현재 보는 법인 — 쿠키에서 읽고, 없거나 이상하면 한국법인.
 * 요청 안에서는 한 번만 읽는다(react cache). 스크립트처럼 요청 밖이면 ENTITY 환경변수(기본 kr).
 */
export const getCurrentEntity = cache(async (): Promise<Entity> => {
  try {
    const v = (await cookies()).get(ENTITY_COOKIE)?.value
    return isEntity(v) ? v : DEFAULT_ENTITY
  } catch {
    const v = process.env.ENTITY
    return isEntity(v) ? v : DEFAULT_ENTITY
  }
})
