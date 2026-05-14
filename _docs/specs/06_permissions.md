# 권한 매트릭스

> 4개 역할 × 8개 테이블 × CRUD 권한 + 행 단위 정책

---

## 1. 역할 정의

| 역할 | 누가 | 주 업무 |
|---|---|---|
| **admin** | 사장님 / IT | 시스템 설정, 마스터 관리, 모든 권한 |
| **accountant** | 회계 담당자 | 거래 전체 조회·수정, 판관비 정리, 세계 발행, 입출금 관리 |
| **sales** | 영업 담당자 (12명) | 자기 거래 등록·조회, 자기 지출 입력 |
| **viewer** | 사장님 (조회용) / 외부 | 조회만, 대시보드·리포트 열람 |

> `admin`과 `viewer`는 시스템 계정. **실제 운영은 `accountant`와 `sales`로 갈림.**

---

## 2. 핵심 정책 결정

### 2.1 영업 → 다른 영업의 거래
**전체 조회 OK / 수정은 본인 것만**
- 이유: 소규모 회사. 협업·이중체크에 유리. 숨길수록 데이터 신뢰 떨어짐.
- 단, **성과급(commission) 컬럼은 자기 것만 볼 수 있게** 마스킹

### 2.2 거래 수정 권한
- **draft / confirmed** 상태: 영업이 자기 거래 수정 가능
- **closed** 상태(입금완료 + 결산완료): **회계만 수정** (감사 추적)
- 영업도 결제일/입금일 update 가능 (자기 거래 한정)
- **금액 변경**(매출금/매입금/VAT) 은 다음 두 경우만:
  - 영업: draft 상태일 때만
  - 회계: 언제든

### 2.3 거래처 마스터
- **신규 등록**: 누구나 가능 (영업도 OK — 거래 입력 흐름에서 자주 발생)
- **수정**: 회계 + admin만 (사업자번호·계좌 잘못 바뀌면 사고)
- **삭제**: admin만 (실제로는 `is_active=false` soft delete)

### 2.4 판관비 (Expense)
- 본인 영수증은 본인이 입력 (`payer_user_id` = 본인)
- 회계는 모든 판관비 수정 가능 (카테고리 재분류 등)
- 영업은 본인 입력건만 수정·삭제 가능

### 2.5 Lookup 마스터 (카테고리/요율 등)
- 수정은 **admin만**. 운영 중 카테고리/요율이 바뀌면 과거 데이터에 영향 → 감사 추적 필요

### 2.6 삭제 정책
- **모든 거래/판관비는 soft delete** (`deleted_at` 컬럼 또는 `status=cancelled`)
- 하드 삭제는 admin만 + 감사 로그 필수

---

## 3. CRUD 매트릭스

> 표기: `O` = 가능 / `S` = self only (본인 거래/지출) / `R` = read only / `-` = 불가

### 3.1 거래 (Deal)

| 작업 | admin | accountant | sales | viewer |
|---|---|---|---|---|
| 목록 조회 (전체) | O | O | O | O |
| 상세 조회 | O | O | O | O |
| 등록 | O | O | S (담당자=본인 강제) | - |
| 수정 (draft) | O | O | S | - |
| 수정 (confirmed) | O | O | S (자기 거래만) | - |
| 수정 (closed) | O | O | - | - |
| **금액 변경** | O | O | S (draft만) | - |
| **상태 전이** (confirm/close) | O | O | S (자기 거래 + draft→confirmed만) | - |
| **성과급 컬럼 조회** | O | O | S (본인 것만) | - |
| 삭제 (soft) | O | O | S (draft만) | - |
| 삭제 (hard) | O | - | - | - |

### 3.2 거래처 (Counterparty)

| 작업 | admin | accountant | sales | viewer |
|---|---|---|---|---|
| 조회 | O | O | O | O |
| 등록 | O | O | O | - |
| 수정 (일반 필드: 주소/메일/메모) | O | O | S (본인 등록건만) | - |
| 수정 (**민감 필드**: 사업자번호/계좌/수수료) | O | O | - | - |
| 머지 (중복 거래처 통합) | O | O | - | - |
| 삭제 (soft) | O | O | - | - |

### 3.3 판관비 (Expense)

| 작업 | admin | accountant | sales | viewer |
|---|---|---|---|---|
| 조회 (전체) | O | O | O | O |
| 등록 | O | O | S (`payer_user_id`=본인) | - |
| 수정 | O | O | S (본인 입력건만) | - |
| 카테고리 재분류 | O | O | - | - |
| 삭제 (soft) | O | O | S (본인 + 등록 7일 이내) | - |

### 3.4 사용자 (User)

| 작업 | admin | accountant | sales | viewer |
|---|---|---|---|---|
| 조회 | O | O | O (이름·팀까지) | R (이름만) |
| 등록 | O | - | - | - |
| 수정 | O | S (본인 프로필) | S (본인 프로필) | S (본인) |
| 역할 변경 | O | - | - | - |
| 비활성화 | O | - | - | - |

### 3.5 Lookup (DealCategory, Account, SalesMethod, ExpenseCategory)

| 작업 | admin | accountant | sales | viewer |
|---|---|---|---|---|
| 조회 | O | O | O | O |
| 등록 | O | - | - | - |
| 수정 (요율 변경 등) | O | - | - | - |
| 삭제 | O | - | - | - |

---

## 4. 화면별 접근 제어 (요약)

| 화면 | admin | accountant | sales | viewer |
|---|---|---|---|---|
| 대시보드 (월별 P&L, 미입금/미결산) | O | O | O (본인 거래 위주 + 전체 토글) | O (조회 전용) |
| 거래 목록·검색 | O | O | O | O |
| 거래 입력·수정 | O | O | S | - |
| 거래처 목록·관리 | O | O | O (조회+신규) | R |
| 판관비 입력 | O | O | O (본인) | - |
| 판관비 정리/리포트 | O | O | - | O |
| 매출장표 (통장/귀속월) | O | O | R | O |
| 성과급 리포트 | O | O | S (본인) | - |
| 거래처 머지·정비 UI | O | O | - | - |
| 사용자 관리 | O | - | - | - |
| Lookup 마스터 관리 | O | - | - | - |
| 마이그레이션 리뷰 큐 | O | O | - | - |
| 감사 로그 | O | R | - | - |

---

## 5. 행 단위 권한 (Row-Level Security) 구현 방안

DB나 ORM 레벨에서 자동 필터 걸기:

```sql
-- 예: sales 역할일 때 Deal 수정 정책
CREATE POLICY deal_update_by_sales ON deal
  FOR UPDATE TO role_sales
  USING (
    owner_user_id = current_user_id()
    AND status IN ('draft', 'confirmed')
  );

-- Expense는 본인 입력건만
CREATE POLICY expense_update_by_sales ON expense
  FOR UPDATE TO role_sales
  USING (created_by = current_user_id() OR payer_user_id = current_user_id());
```

> Postgres RLS / Supabase 정책으로 구현하거나, 애플리케이션 미들웨어에서 처리.
> 두 레이어 모두에서 체크하는 게 안전 (defense in depth).

---

## 6. 감사 로그 (Audit Trail)

소규모 회사라 별도 시스템 안 만들고, 각 테이블에 다음 컬럼 + 변경 이력 테이블 하나:

### 6.1 각 테이블 공통 컬럼
```
created_at, created_by, updated_at, updated_by, deleted_at, deleted_by
```

### 6.2 audit_log 테이블 (선택, P1)
```
audit_log
├─ id
├─ table_name        -- 'deal'
├─ record_id         -- deal.id
├─ action            -- 'create' / 'update' / 'delete'
├─ actor_user_id
├─ changes           -- jsonb (변경 전/후 diff)
├─ ip_address
├─ created_at
```

**필수 로깅 대상:**
- Deal 금액 변경 (sales/purchase amount)
- Deal 상태 전이 (draft → confirmed → closed)
- Counterparty 민감 필드 변경 (사업자번호/계좌)
- 사용자 역할 변경
- Lookup 마스터 변경 (요율 등)

> 일반 조회·읽기는 로깅 안 함 (오버헤드).

---

## 7. 인증 (참고)

- 이메일 + 비밀번호 (또는 OAuth — 카카오/구글)
- 세션 만료: 8시간 (회계 작업 보안)
- 비밀번호 정책: 최소 8자, 영문/숫자
- 실패 5회시 15분 잠금
- 회계·admin 계정은 **2FA 권장** (P1)

---

## 8. 결정 사항 / 추후 검토

✅ **결정됨**:
- 영업끼리 거래 전체 조회 OK, 수정만 자기 것
- 성과급 컬럼은 본인 것만
- 거래처 민감 필드는 회계+admin만
- 판관비는 본인 영수증 본인 입력
- Soft delete 기본

⏳ **추후 확정** (운영하면서 결정):
- 영업이 본인 거래를 closed로 만들 수 있는지 (현재: 회계만)
- 성과급 마스킹을 팀장에게도 적용할지
- 외부 회계사용 viewer 계정 — 기간/카테고리별 필터링
