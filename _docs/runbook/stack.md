# 기술스택 / 운영 가이드

> 로컬 환경, 5명 이하 동시 사용, Postgres 기반.

---

## 1. 스택 구성

```
┌─────────────────────────────────────────────────┐
│  Browser (LAN 사내 접속)                          │
│  http://askim-erp.local:3000                     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  Next.js 15 (App Router, Node.js)                │
│  - shadcn/ui + Tailwind                          │
│  - react-hook-form + zod                         │
│  - TanStack Query                                │
│  - Auth.js (credentials)                         │
└─────────────────┬───────────────────────────────┘
                  │ Drizzle ORM
┌─────────────────▼───────────────────────────────┐
│  Postgres 16 (Docker)                            │
│  - pg_trgm 익스텐션 (한글 검색)                  │
│  - RLS (행 단위 권한)                            │
└─────────────────────────────────────────────────┘
```

## 2. 패키지 선정 이유

| 패키지 | 선정 이유 |
|---|---|
| **Next.js 15 (App Router)** | 사용자 익숙. Server Actions로 백엔드 분리 안 해도 됨. |
| **Postgres 16** | RLS, generated column, pg_trgm 모두 native. 클라우드 이전 즉시 가능. |
| **Drizzle** | TypeScript-first ORM, 마이그레이션 깔끔, Prisma 대비 가볍고 명시적. |
| **shadcn/ui** | 좌/우 2단 폼·테이블·자동완성 컴포넌트 다 있음. 코드 직접 카피해서 커스텀. |
| **Tailwind** | shadcn 짝궁. |
| **react-hook-form + zod** | 40+ 필드 폼 검증의 표준. |
| **TanStack Query** | 거래 목록/검색 캐싱·낙관적 업데이트. |
| **Auth.js (NextAuth v5)** | credentials provider로 자체 로그인. 5명 환경엔 충분. |

> **Prisma 안 쓰는 이유**: generated column 지원이 빈약하고, Drizzle이 SQL에 더 가까워서 디버깅 쉬움.
> **Supabase 안 쓰는 이유**: 로컬 사용이면 오버킬. Drizzle + Auth.js로 같은 기능 가능.

## 3. 프로젝트 구조

```
askim-erp/
├── docker-compose.yml          # Postgres + pgAdmin
├── .env.local                  # DATABASE_URL, AUTH_SECRET
├── package.json
├── drizzle.config.ts
├── next.config.mjs
├── tsconfig.json
│
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/
│   │   │   ├── deals/
│   │   │   │   ├── page.tsx              # 목록
│   │   │   │   ├── [id]/edit/page.tsx    # 수정
│   │   │   │   └── new/page.tsx          # 신규
│   │   │   ├── counterparties/...
│   │   │   ├── expenses/...
│   │   │   └── dashboard/page.tsx
│   │   └── api/                          # Route Handlers
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema/                   # Drizzle 스키마 (테이블별)
│   │   │   ├── client.ts
│   │   │   └── migrations/
│   │   ├── auth/
│   │   └── validators/                   # zod 스키마
│   │
│   ├── components/
│   │   ├── ui/                           # shadcn 컴포넌트
│   │   ├── deals/
│   │   │   ├── deal-form.tsx             # ⭐ 좌/우 2단 폼
│   │   │   ├── deal-table.tsx
│   │   │   └── counterparty-combobox.tsx # 자동완성
│   │   └── ...
│   │
│   └── server/
│       ├── actions/                      # Server Actions
│       └── queries/                      # 읽기 쿼리
│
├── scripts/
│   ├── migrate-excel.ts                  # 엑셀 → DB 이관
│   └── backup.sh                         # pg_dump 자동 백업
│
└── _docs/                                # 분석/설계 문서
```

## 4. 개발 환경 셋업 (한 번)

```bash
# 1. 저장소 + 의존성
cd /home/jpex/projects/askim-erp
npm install

# 2. Docker로 Postgres 띄우기
docker compose up -d
# → postgres:16 컨테이너, 포트 5432
# → 데이터는 ./pgdata/ 볼륨에 영구 저장

# 3. .env.local 작성
cat > .env.local <<EOF
DATABASE_URL=postgresql://askim:askim@localhost:5432/askim_erp
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=http://localhost:3000
EOF

# 4. 스키마 마이그레이션
npm run db:migrate
npm run db:seed              # Lookup 데이터 시드

# 5. 엑셀 데이터 이관 (1회)
npm run import:excel -- ./2026_에스킴.xlsx

# 6. 개발 시작
npm run dev
```

## 5. 운영 (매일)

```bash
# 서비스 시작 (PM2 사용)
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup                  # 부팅 시 자동 시작

# 또는 systemd 사용
sudo systemctl enable askim-erp
sudo systemctl start askim-erp
```

### 사내 LAN 접속
- 서버 PC의 IP 확인 (`ip addr` 또는 `ipconfig`)
- 방화벽 3000 포트 허용
- 직원들은 `http://192.168.0.X:3000` 접속
- 또는 hosts 파일에 `askim-erp.local` 등록

## 6. 백업 (필수)

### 6.1 일일 자동 백업

`/etc/crontab` 또는 사용자 crontab:

```cron
# 매일 새벽 2시 백업
0 2 * * * docker exec askim-postgres pg_dump -U askim askim_erp | gzip > /backup/askim_$(date +\%Y\%m\%d).sql.gz

# 30일 이상 백업 삭제
30 2 * * * find /backup -name 'askim_*.sql.gz' -mtime +30 -delete
```

### 6.2 백업 위치 다중화
1. 로컬 SSD: `/backup/` (서버 PC)
2. **외부 NAS** 또는 **외장 SSD** (필수 — 서버 PC 망가지면 끝)
3. 클라우드 (선택, 암호화) — Google Drive / OneDrive

### 6.3 복구 테스트
- 분기 1회: 백업 파일로 복구 가능한지 실제 테스트
- 새 DB에 `pg_restore` 후 데이터 검증

## 7. docker-compose.yml (예시)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: askim-postgres
    environment:
      POSTGRES_USER: askim
      POSTGRES_PASSWORD: askim
      POSTGRES_DB: askim_erp
    ports:
      - "5432:5432"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U askim"]
      interval: 10s

  pgadmin:                  # 선택 - DB 관리 GUI
    image: dpage/pgadmin4
    container_name: askim-pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@askim.local
      PGADMIN_DEFAULT_PASSWORD: askim
    ports:
      - "5050:80"
    depends_on:
      - postgres
```

`scripts/init.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- 한글 fuzzy 검색
CREATE EXTENSION IF NOT EXISTS unaccent;       -- 옵션
```

## 8. 환경별 차이

| 항목 | 로컬 개발 | 로컬 운영 (사내 LAN) | 클라우드 이전시 |
|---|---|---|---|
| DB | Docker Postgres | Docker Postgres | Neon (무료/유료) |
| 호스팅 | `npm run dev` | PM2 + Nginx | Vercel |
| Auth | Auth.js credentials | 동일 | Auth.js or Clerk |
| 백업 | 안 함 | cron + NAS | Neon 자동 백업 |
| 도메인 | localhost:3000 | askim-erp.local | askim-erp.vercel.app |

→ **코드 변경 없이 환경변수 + 호스팅만 바꿔서 이전 가능.**

## 9. 보안 (로컬 환경)

- 사내 LAN에서만 접속 (외부 인터넷 노출 X) — 방화벽 inbound 3000 차단
- HTTPS는 옵션 (LAN 안이면 HTTP OK, 신뢰 환경)
- 비밀번호 bcrypt 해시
- DB 컨테이너는 LAN에 노출 안 함 (`127.0.0.1:5432`만 바인드)
- 백업 파일은 암호화 (`gpg --encrypt`) 권장

## 10. 다음 단계 (개발 착수)

1. **프로젝트 초기화** — `create-next-app` + shadcn init + Drizzle 셋업
2. **Drizzle 스키마 작성** — `_docs/specs/04_data_model.md` 기반 8테이블
3. **Auth 셋업** — 로그인/세션
4. **Lookup 시드** — `_docs/specs/05_migration_mapping.md` SQL 실행
5. **거래처 import 스크립트** — 엑셀 → DB
6. **거래 입력 폼** — `_docs/specs/07_mvp_wireframes.md` 기반
7. **거래 목록 + 검색**
8. **엑셀 거래 데이터 import**
9. **사내 LAN 배포 + 백업 cron**
