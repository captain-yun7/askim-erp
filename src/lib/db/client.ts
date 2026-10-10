import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

// Supabase 트랜잭션 풀러(6543)는 prepared statement 를 지원하지 않는다 (2026-10-10 서울 이전)
const client = postgres(connectionString, { max: 10, prepare: false })
export const db = drizzle(client)
export type DB = typeof db
