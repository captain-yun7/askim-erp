/**
 * 목록에서 걸어 둔 필터를 기억했다가 등록·수정·삭제 뒤 같은 상태의 목록으로 돌아간다 (2026-09-29 요청).
 * 탭 단위(sessionStorage)로만 기억하고, 왼쪽 메뉴로 목록을 다시 열면 필터 없는 주소가 기억된다.
 */
const KEY = 'askim-list:'

export function rememberList(path: string, search: string) {
  try {
    sessionStorage.setItem(KEY + path, search)
  } catch {}
}

export function listHref(path: string): string {
  try {
    const search = sessionStorage.getItem(KEY + path)
    return search ? `${path}?${search}` : path
  } catch {
    return path
  }
}
