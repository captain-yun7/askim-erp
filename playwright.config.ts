import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // 개발 서버가 화면을 처음 컴파일할 때 걸리는 시간 때문에 전체 실행에서만 가끔 실패한다 — 한 번 다시 시도
  retries: 1,
  timeout: 40_000,
  expect: { timeout: 12_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3300',
    headless: true,
    actionTimeout: 12_000,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
