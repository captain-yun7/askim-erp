// 스크립트 실행 시 .env.local 로드
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set — check .env.local')
}
