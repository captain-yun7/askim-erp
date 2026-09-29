/**
 * 목록 필터 주소 이동 (2026-09-29 긴급 요청).
 * 필터를 연달아 걸면 앞 이동이 끝나기 전이라 주소창에는 아직 앞 필터가 없다.
 * 그 주소를 기준으로 다음 필터를 만들면 앞 필터가 사라지므로, 방금 보낸 주소를 기억해 기준으로 쓴다.
 */
type Pending = { path: string; search: string; at: number }
let pending: Pending | null = null
let listening = false

const PENDING_MS = 15_000

export function currentFilterParams(path: string): URLSearchParams {
  const live = window.location.search.replace(/^\?/, '')
  if (pending && pending.path === path && window.location.pathname === path && Date.now() - pending.at < PENDING_MS && pending.search !== live) {
    return new URLSearchParams(pending.search)
  }
  pending = null
  return new URLSearchParams(live)
}

export function pushFilterParams(router: { push: (href: string) => void }, path: string, params: URLSearchParams) {
  if (!listening) {
    listening = true
    // 뒤로가기·앞으로가기를 하면 기억해 둔 주소는 더 이상 기준이 아니다
    window.addEventListener('popstate', () => {
      pending = null
    })
  }
  const search = params.toString()
  pending = { path, search, at: Date.now() }
  router.push(search ? `${path}?${search}` : path)
}
