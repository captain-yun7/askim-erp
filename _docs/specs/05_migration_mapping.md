# 마이그레이션 매핑 (엑셀 → DB)

> 엑셀 컬럼·시트를 DB 테이블·컬럼에 1:1 매핑.
> 변환 규칙·데이터 품질 이슈·임포트 순서 정의.

---

## 0. 임포트 순서 (의존성)

```
1. Lookup (시드 데이터)
   ├─ deal_category  (15건, 수동 정의)
   ├─ account        (6건, 수동 정의)
   ├─ sales_method   (4건, 수동 정의)
   └─ expense_category (~25건, 수동 정의)

2. User (수동 입력, ~13명)

3. Counterparty (자동 import + 자동 보강)
   ├─ Step 3a: 거래처관리 시트 import (287건)
   └─ Step 3b: 거래 시트에서 마스터에 없는 376건 자동 생성

4. Deal (자동 import)
   ├─ 원화매출매입  (563건)
   ├─ 외화매출매입  (12건)
   └─ IP&협찬건    (37건)

5. Expense (자동 import)
   ├─ 판관비 외          (2,027건)
   └─ 개인카드, 현금사용  (~20건)
```

---

## 1. Lookup 시드 데이터 (수동 정의)

### 1.1 deal_category — 15건

```sql
INSERT INTO deal_category (code, name_ko, commission_rate, is_overseas, is_special_share, display_order) VALUES
  ('outwall_self_seongsu',   '외벽/자사(성수)',     0.10, false, null,         1),
  ('outwall_self_other',     '외벽/자사(성수 외)',  0.10, false, null,         2),
  ('outwall_share_seongsu',  '외벽/공판(성수)',     0.10, false, null,         3),
  ('outwall_share_other',    '외벽/공판(성수 외)',  0.10, false, null,         4),
  ('exclusive_self',         '전속/자사',          0.10, false, null,         5),
  ('etc_self',               '기타/자사',          0.10, false, null,         6),
  ('fanclub_self',           '팬클럽/자사',         0.20, false, null,         7),
  ('fanclub_agency',         '팬클럽/대행',         0.30, false, null,         8),
  ('popup',                  '팝업',              0.10, false, null,         9),
  ('overseas',               '해외매체',           0.15, true,  null,        10),
  ('sales_agency',           '영업대행',           0.30, false, null,        11),
  ('purchase_only',          '매입건',             0.00, false, null,        12),
  ('sponsorship_self',       '협찬/자사',          0.00, false, null,        13),
  ('ip',                     'IP',               0.00, false, 'narin_20',  14),
  ('han_river_bus',          '한강버스',           0.10, false, null,        15),
  ('china_biz',              '중국사업',           0.00, false, null,        16);
```

### 1.2 account — 6건

```sql
INSERT INTO account (code, name_ko, display_order) VALUES
  ('ad_fee',           '광고비',    1),
  ('production_fee',   '제작비',    2),
  ('deposit',          '보증금',    3),
  ('contract_advance', '계약금',    4),
  ('advance',          '선금',     5),
  ('balance',          '잔금',     6);
```

**텍스트 정규화 매핑** (마이그레이션 시):
| 엑셀 원본 | DB code |
|---|---|
| `광고비`, `광고료` | `ad_fee` |
| `제작비`, `제직비` | `production_fee` |
| `보증금` | `deposit` |
| `계약금` | `contract_advance` |
| `선금` | `advance` |
| `잔금` | `balance` |
| (그 외/공백) | `ad_fee` (기본값) + 경고 로그 |

### 1.3 sales_method — 5건

```sql
INSERT INTO sales_method (code, name_ko, display_order) VALUES
  ('tax_invoice',   '세금계산서',    1),
  ('cash_receipt',  '현금영수증',    2),
  ('card',          '카드결제',     3),
  ('alipay',        '알리페이',     4),
  ('bank_transfer', '계좌이체',     5);
```

### 1.4 expense_category — ~25건

```sql
INSERT INTO expense_category (code, name_ko, is_fixed_cost, display_order) VALUES
  -- 변동비 (사용빈도순)
  ('meals',           '식대비',     false,  1),
  ('transport',       '교통비',     false,  2),
  ('commission_fee',  '지급수수료',  false,  3),
  ('welfare',         '복리후생비',  false,  4),
  ('donation',        '기부금',     false,  5),
  ('books_print',     '도서인쇄비',  false,  6),
  ('travel',          '출장비',     false,  7),
  ('marketing',       '마케팅비',    false,  8),
  ('office_supplies', '사무용품비',  false,  9),
  ('entertainment',   '접대비',     false, 10),
  ('external_labor',  '외부인건비',  false, 11),
  ('postage',         '우편요금',    false, 12),
  ('outsourcing',     '외주용역비',  false, 13),
  ('cargo',           '운반비',     false, 14),
  ('education',       '교육비',     false, 15),
  -- 고정비
  ('labor',            '인건비',         true, 20),
  ('social_insurance', '4대보험료',      true, 21),
  ('office_rent',      '지급임차료',     true, 22),
  ('utility',          '건물관리비',     true, 23),
  ('communication',    '통신비',        true, 24),
  ('loan_interest',    '대출이자',      true, 25);
```

**엑셀 정규화 매핑** (괄호 제거):
| 엑셀 원본 | DB code |
|---|---|
| `(식대비)`, `(식` | `meals` |
| `(교통비)`, `(교` | `transport` |
| `(지급수수료)` | `commission_fee` |
| ... | (위 시드 테이블과 동일) |

> ⚠️ 엑셀에 `(교`, `(식` 같이 **잘려서 입력된 값** 발견 — `LIKE '(교%'` 식으로 부분매칭 후 사람 확인

---

## 2. User — 수동 입력 (~13명)

엑셀에 사용자 마스터 없음. 거래 데이터에서 추출 + 수동 보강:

| name | email | role | deal_code_prefix | team |
|---|---|---|---|---|
| 김형준 | (?) | sales | AZ | 국내영업 |
| 최현정 | (?) | sales | AC | 국내영업 |
| 이유정 | (?) | sales | AY | 국내영업 |
| 박지운 | (?) | sales | AW | 국내영업 |
| 강지호 | (?) | sales | AH | 국내영업 |
| 오혁 | (?) | sales | AO | 국내영업 |
| 유찬영 | (?) | sales | AU | 국내영업 |
| 이명철 | (?) | sales | AM | 국내영업 |
| 이나린 | (?) | sales | AN | 국내영업 (콘텐츠팀) |
| 윤도경 | (?) | sales | (?) | — |
| 김해준 | (?) | sales | FJ | 해외영업 |
| 해외영업팀 (그룹) | — | — | AD/AK | 해외영업 |
| 중국사업부 (그룹) | — | — | CN | 중국사업부 |

> 이메일·역할은 사장님 확인 필요. 팀 단위 계정(해외영업팀/중국사업부)도 일단 생성 — 거래 import 시 매칭용.

---

## 3. Counterparty 마이그레이션

### 3a. 거래처관리 시트 → counterparty (287건)

| 엑셀 컬럼 | DB 컬럼 | 변환 규칙 |
|---|---|---|
| 상호명 (col 3) | `name` | TRIM, NOT NULL |
| 사업자등록번호 (col 4) | `business_no` | TRIM, 탭/공백 제거 (예: `\t201-86-41097`), `-` 유지 |
| 대표자 (col 5) | `ceo` | TRIM |
| 주소 (col 6) | `address` | TRIM |
| 업태 (col 7) | `business_type` | TRIM |
| 종목 (col 8) | `business_category` | TRIM, `광고대행`/`광고 대행업`/`광고대행업` 통합 (선택) |
| 전화번호 (col 9) | `phone` | TRIM |
| 담당자 (col 10) | `contact_person` | TRIM |
| 메일 (col 11) | `email` | TRIM, 탭 제거 |
| 계좌번호 (col 12) | `bank_account_raw` | 그대로 (`100-000-424857 (신한)`) |
| 은행명 (col 13) | (무시) | 거의 비어있음 |
| 예금주명 (col 14) | `account_holder` | TRIM |
| 공식수수료 (col 15) | `official_fee_rate` | 문자/숫자 그대로 |
| 비공식수수료 (col 16) | `unofficial_fee_rate` | TRIM (페이백) |
| 결제일 (col 17) | `payment_term` | TRIM |
| 비고 (col 18) | `memo` | TRIM |

**자동 부여:**
- `role_tags`: 거래 데이터 import 후 자동 추론
  - `매입처` 컬럼에 등장 → `'media'` 태그
  - `실광고주`에 등장 → `'advertiser'` 태그
  - `발행처`에 등장 (대행) → `'agency'` 태그
- `is_active`: 기본 true

### 3b. 마스터에 없는 376건 자동 생성

거래 데이터에서 등장하지만 거래처관리에 없는 상호 376건:
- 마스터에 자동 INSERT (`name`만 채우고 나머지 NULL)
- `memo`에 `'auto-created from deal import'` 표시
- 사용자가 사후에 정비

**의심 패턴 (별도 리뷰 큐로)**:
- `'2025. 12월 광고료'` 같은 날짜 형식 → 거래처 아님, 메모로 옮겨야
- `'BTS RM 팬클럽'`, `'BTS 슈가'` → 매체 카테고리인지 광고주인지 확인 필요
- `'(주)스테이위드'` vs 잠재 `'스테이위드'` 중복 가능

→ 마이그레이션 스크립트에 **`--review-suspicious`** 플래그 또는 별도 큐 테이블

### 3c. 유사 중복 거래처 머지

탐지된 케이스:
| 그룹 | 거래처 |
|---|---|
| 애드웍스 | `애드웍스`, `㈜ 애드웍스` |

**머지 정책**:
- 정규화 키 = `lower(regexp_replace(name, '[\s()㈜()]+', ''))`
- 같은 키를 가진 거래처는 머지 후보로 표시
- 자동 머지하지 말고 **수동 확인** (잘못된 머지 위험)

---

## 4. Deal 마이그레이션

### 4.1 원화매출매입 → deal (563건)

| 엑셀 컬럼 | DB 컬럼 | 변환 규칙 |
|---|---|---|
| 부가세 신고 체크 (col 1) | `vat_filed` | bool (현재 전부 빈값 → false) |
| 거래코드 (col 3) | `deal_code` | TRIM, **중복 11건 처리 필요** (아래 참조) |
| (generated) | `deal_code_base` | `regexp_replace(deal_code, '-\d+$', '')` |
| 귀속연도 (col 4) | `accrual_year` | int. `'2026'` → 2026, `'``' ` 같은 오류값은 NULL + 경고 |
| 귀속월 (col 5) | `accrual_month` | `'1월'` → 1, `'12월'` → 12 |
| 상품구분 (col 6) | `category_id` | name_ko 매칭 후 FK |
| 담당자 (col 7) | `owner_user_id` | name 매칭 후 FK. 매칭 안 되면 ERROR |
| 매출수단 (col 8) | `sales_method_id` | name_ko 매칭 |
| 매출금 입금예정일 (col 9) | `sales_due_date` | datetime → date. `'-'` 또는 빈값 → NULL |
| 입금일 (col 10) | `sales_paid_date` | datetime → date |
| 입금여부 (col 11) | `sales_paid_status` | `'완료'` → `'completed'`, 빈값 → `'pending'` |
| 매출용 세계발행일 (col 12) | `sales_invoice_date` | date |
| 비고(매출) (col 13) | `sales_memo` | TRIM |
| 결산연도 (col 14) | `settlement_year` | int |
| 결산예정일 (col 15) | `purchase_due_date` | `'3월'` 같은 값과 date 값 혼재 → 정리 필요 |
| 매입용 세계발행일 (col 16) | `purchase_invoice_date` | date |
| 결산여부 (col 17) | `purchase_paid_status` | `'완료'` → `'completed'` |
| 지급일(결산일) (col 18) | `purchase_paid_date` | date |
| 비고(매입) (col 19) | `purchase_memo` | TRIM |
| 거래처명(매출세계 발행처) (col 20) | `issuer_counterparty_id` | name 매칭 후 FK (auto-create) |
| 실광고주 (col 21) | `advertiser_counterparty_id` | name 매칭 후 FK (nullable) |
| 품목명 (col 22) | `item_name` | TRIM |
| 광고 시작 (col 23) | `ad_start` | date |
| 광고 종료 (col 24) | `ad_end` | date |
| 계정항목 (col 25) | `account_id` | 텍스트 매핑 후 FK (광고비/광고료 통합) |
| 매출금 (col 26) | `sales_amount_net` | numeric, 빈값 → 0 |
| 부가세 (col 27) | `sales_vat` | numeric. 비어있으면 `sales_amount_net * 0.1` 자동계산 |
| 부가세포함 총매출금 (col 28) | `sales_amount_gross` | numeric. 검증: `≈ net + vat` |
| 상호명 (col 29) | `supplier_counterparty_id` | 매입처 — name 매칭 |
| 수수료 (col 30) | `purchase_pricing_raw` | 자유 텍스트 (`입금가`/`0.1`/등) |
| 매입금 (col 32) | `purchase_amount_net` | numeric |
| 부가세 (col 33) | `purchase_vat` | numeric |
| 부가세포함 총매입금 (col 34) | `purchase_amount_gross` | numeric |
| 손익 (col 35) | (무시 — generated) | 검증용으로 비교 후 폐기 |
| 성과급(%) (col 36) | `commission_pct` | numeric |
| 성과급 (col 37) | `commission_amount` | numeric |

**고정 컬럼:**
- `currency` = `'KRW'`
- `status` = `'confirmed'` (이미 운영 중이므로)
- `split_group` = `deal_code_base` (자동)
- `created_by` = system user

### 4.2 외화매출매입 → deal (12건)

- 동일 매핑, `currency` 다르게:
  - 매출수단=`alipay` → `currency = 'USD'` (또는 CNY, 메모로 판별)
  - 매출수단=`세금계산서` → 외화건 1건, `currency = 'KRW'` (실제로는 원화)
- `fx_rate`: 메모에서 추출 (`USD1,575.52입금` → 매출금/1575.52). 부정확하면 NULL.
- **외화 거래의 실제 외화 금액은 별도 시스템 도입 후 정리**

### 4.3 IP&협찬건 → deal (37건)

- 동일 매핑
- `category_id` = `'ip'` 또는 `'sponsorship_self'` (원본 데이터의 `기타/자사` 그대로 둠. 사후 분류)
- 메모에 `'IP 20% share to 이나린'` 자동 추가

### 4.4 거래코드 중복 11건 처리

발견된 중복: `AY250303`, `AZ251206`, `AZ251206-2`, `AY260204`, `AY260205` 등

**정책:**
1. 같은 시트 안에서 중복이면 → 두 번째에 `-2` (이미 `-2`면 `-3`) 자동 부여 + 경고 로그
2. 다른 시트(원화 vs 외화)에서 중복이면 → 그대로 둠 (별 시트, 별 거래로 간주)

스크립트에서 충돌 감지 후 자동 처리.

### 4.5 데이터 타입 이슈

| 컬럼 | 이슈 | 처리 |
|---|---|---|
| `귀속연도` = `'``'` | 1건 | NULL + 리뷰 큐 |
| `결산예정일` | 일부 `'3월'` 텍스트 / 일부 date 혼재 | date면 그대로, 텍스트면 NULL + memo에 보존 |
| `귀속월` = `'23년12월'` | IP 시트에 1건 | → `accrual_year=2023, accrual_month=12` 분해 |
| `'-'` 값 | 입금예정일/지급일 등 | NULL |

---

## 5. Expense 마이그레이션

### 5.1 판관비 외 → expense (2,027건)

| 엑셀 컬럼 | DB 컬럼 | 변환 규칙 |
|---|---|---|
| 연도 (col 3) | (generated from expense_date) | — |
| 월 (col 4) | (generated) | — |
| 지출일 (col 5) | `expense_date` | date, NOT NULL |
| 품목 (col 6) | `item_name` | TRIM (자유텍스트) |
| 합계 (col 7) | `amount` | numeric, NOT NULL |
| (없음) | `vat` | NULL (엑셀에 부가세 컬럼 없음) |
| 거래처 (col 8) | `counterparty_text` | TRIM. 마스터 매칭률 0.4%이므로 텍스트 보존 |
| (조건부) | `counterparty_id` | 마스터 매칭되면 FK 부여 |
| 거래항목 (col 9) | `expense_category_id` | `'(식대비)'` → `meals` 매핑 |
| 지출자 (col 10) | `payer_user_id` | 비어있음 → NULL |
| 지출수단 (col 11) | `payment_method` | 비어있음 → 기본값 `corporate_card` |

**기본값:**
- `payment_method` = `'corporate_card'` (전부 법인카드로 가정)
- `payer_user_id` = NULL (지출자 컬럼 미사용)

### 5.2 개인카드, 현금사용 → expense (~20건)

| 엑셀 컬럼 | DB 컬럼 |
|---|---|
| 월 (col 3) | (generated from 처리일) |
| 처리일 (col 4) | `expense_date` |
| 품목 (col 5) | `item_name` |
| 금액 (col 6) | `amount_net` (= 금액) |
| 부가세 (col 7) | `vat` |
| 합계 (col 8) | `amount` |
| 거래처 (col 9) | `counterparty_text` |
| 거래항목 (col 10) | `expense_category_id` |

**기본값:**
- `payment_method` = `'personal_card'` 또는 `'cash'` (구분 안 됨 → 일단 `personal_card`, 사용자 사후 분류)

---

## 6. 검증 단계 (마이그레이션 후)

```
[1] 행 수 검증
    원화매출매입 563 = deal(currency=KRW, source=원화) 563
    외화매출매입 12  = deal(source=외화) 12
    IP&협찬건 37     = deal(source=IP) 37
    판관비 외 2027   = expense(source=판관비) 2027

[2] 금액 합계 검증
    원화 매출 합계 = 4,800,891,278  ← deal.sales_amount_net 합과 일치
    원화 매입 합계 = 3,620,342,895  ← deal.purchase_amount_net 합과 일치
    원화 손익 합계 = 1,191,742,680  ← deal.profit 합과 일치
    판관비 합계   = 955,488,980    ← expense.amount 합과 일치

[3] 거래코드 unique
    SELECT deal_code, count(*) FROM deal GROUP BY 1 HAVING count(*) > 1;
    → 0 rows

[4] 거래처 FK 100%
    SELECT count(*) FROM deal WHERE issuer_counterparty_id IS NULL;
    → 0 (또는 명시적으로 nullable 정책 결정)

[5] Lookup FK 100%
    SELECT count(*) FROM deal d LEFT JOIN deal_category c ON d.category_id=c.id
    WHERE c.id IS NULL;
    → 0
```

---

## 7. 리뷰 큐 (사람 확인 필요)

마이그레이션 스크립트가 자동 처리 못한 케이스를 별도 테이블에:

```
migration_issue
├─ id
├─ source_sheet           -- '원화매출매입'
├─ source_row             -- 엑셀 행 번호
├─ severity               -- 'warning' / 'error'
├─ issue_type             -- 'suspicious_counterparty' / 'date_text_mixed' / ...
├─ raw_data               -- jsonb (해당 행 원본)
├─ suggested_action       -- 'create_counterparty' / 'split_text_date' / ...
├─ resolved               -- bool
└─ created_at
```

예상되는 이슈 카테고리:
| 카테고리 | 추정 건수 |
|---|---|
| 의심 거래처 (`2025. X월 광고료` 등) | ~15 |
| 거래코드 중복 | 11 |
| 귀속월 텍스트 (`23년12월` 등) | 1~2 |
| 결산예정일 텍스트 (`3월`) | 다수 |
| 잘린 거래항목 (`(교`, `(식`) | ~30 |
| 사업자번호 형식 오류 | ~5 |

---

## 8. 마이그레이션 실행 절차

```bash
# 1. DB 스키마 생성 (migrations)
# 2. Lookup seed
# 3. User seed (수동 입력)
# 4. 거래처 import
python migrate.py counterparty --file askim.xlsx --dry-run
python migrate.py counterparty --file askim.xlsx

# 5. 거래 import (3개 시트 통합)
python migrate.py deals --file askim.xlsx --dry-run
python migrate.py deals --file askim.xlsx

# 6. 판관비 import
python migrate.py expenses --file askim.xlsx --dry-run
python migrate.py expenses --file askim.xlsx

# 7. 검증
python migrate.py verify --file askim.xlsx
```

각 단계는 `--dry-run`으로 변환 결과만 미리보기 가능.

---

## 9. 결정된 처리 정책

1. **외화 거래 12건의 통화 분리**: 메모에서 정규식(`(USD|CNY)\s*[\d,.]+`)으로 자동 추출. 실패시 KRW로 두고 메모 보존.
2. **거래코드 중복 11건**: 자동 `-N` suffix 부여 (이미 `-2`면 `-3` 등). 경고 로그만 남김.
3. **자동 생성된 거래처 376건**: 마이그레이션 시점엔 정비 안 함. ERP에 **거래처 정비 UI**를 만들고 운영하면서 천천히 머지/보강.
4. **`귀속월=23년12월`**: 자동 분해 (`year=2023, month=12`). 1건뿐.
