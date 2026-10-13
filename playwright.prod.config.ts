import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

/**
 * 운영 화면 점검 (2026-10-13) — 배포 후 실제 운영 사이트를 읽기만 하며 확인한다.
 * 계정은 조회 전용(viewer) "점검용(자동)" — 수정·삭제가 서버에서 막히고 인사관리(급여)에 못 들어간다.
 * 자격증명은 저장소 밖 _docs/qa-account.env (PROD_QA_EMAIL, PROD_QA_PASSWORD)
 */
if (existsSync('_docs/qa-account.env')) process.loadEnvFile('_docs/qa-account.env')

export default defineConfig({
  testDir: './e2e-prod',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.PROD_URL ?? 'https://askim-erp.vercel.app',
    headless: true,
    actionTimeout: 15_000,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
