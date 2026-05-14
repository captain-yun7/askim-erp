# 데이터 모델 / 스키마 (MVP)

> 원칙: **엔터티는 정규화, 룰/엣지는 보류**
> 8개 테이블로 시작 — 분석 문서(01~03)의 결론 반영

---

## ERD 개요

```
┌────────────────┐         ┌──────────────┐
│  Counterparty  │◄────┐   │    User      │
│  (거래처)        │     │   │  (담당자)      │
└────────────────┘     │   └───────┬──────┘
        ▲              │           │
        │ 매출발행처/      │           │ 담당
        │ 실광고주/매입처   │           ▼
        │              │   ┌──────────────┐
        └──────────────┴───┤    Deal      │ ← FK
                           │    (거래)      │
        ┌──────────────────┤              │
        │                  └──────────────┘
        │                          │
        │                          ├──► DealCategory (상품구분)
        │                          ├──► Account (계정항목)
        │                          └──► SalesMethod (매출수단)
        │
        │     ┌──────────────┐
        └────►│   Expense    │──► ExpenseCategory (거래항목)
              │   (판관비)     │──► User (지출자)
              └──────────────┘
```

**Lookup 4개** (DealCategory / Account / SalesMethod / ExpenseCategory)
**엔터티 3개** (Counterparty / User / Deal)
**트랜잭션 1개** (Expense는 사실상 엔터티지만 별 흐름)

---

## 1. Counterparty — 거래처 마스터

매체사·광고주·대행사·영수증 상호를 한 테이블에 통합. role_tags로 구분.

```
counterparty
├─ id                    PK (uuid)
├─ name                  text  NOT NULL   -- 상호명
├─ business_no           text             -- 사업자등록번호 (10자리)
├─ ceo                   text             -- 대표자
├─ address               text
├─ business_type         text             -- 업태 (서비스업 등)
├─ business_category     text             -- 종목 (매체사/광고대행업 등)
├─ phone                 text
├─ email                 text
├─ contact_person        text             -- 거래처측 컨택
├─ bank_account_raw      text             -- "100-000-424857 (신한)" 엑셀 원본 형식
├─ account_holder        text             -- 예금주명
├─ official_fee_rate     text             -- "입금가", "0.1" 등 (자유 표현 허용)
├─ unofficial_fee_rate   text             -- 페이백 (자유 표현)
├─ payment_term          text             -- "익월말", "당월말" 등
├─ role_tags             text[]           -- ['media','advertiser','agency','expense_vendor']
├─ memo                  text
├─ is_active             bool DEFAULT true
├─ created_at, updated_at, created_by
└─ UNIQUE (business_no) WHERE business_no IS NOT NULL
```

**설계 메모:**
- 사업자번호는 nullable + unique partial index (없는 거래처 많음)
- bank_account은 분해하지 않고 raw 텍스트 (엑셀 그대로) — 나중에 정규화 가능
- 수수료는 `text` (값이 `입금가`, `0.1`, `20%, 30%(L등급)` 등 자유로움)
- role_tags는 배열로 다중 역할 허용

---

## 2. User — 사용자/담당자

```
user
├─ id                    PK
├─ email                 text UNIQUE NOT NULL
├─ name                  text NOT NULL
├─ role                  enum('admin','accountant','sales','viewer')
├─ deal_code_prefix      text             -- AZ, AC, AY, FJ 등
├─ team                  text             -- '국내영업', '해외영업', '중국사업부', '본부' 등
├─ is_active             bool DEFAULT true
├─ created_at, updated_at
└─ UNIQUE (deal_code_prefix) WHERE deal_code_prefix IS NOT NULL
```

**역할별 권한 (별도 문서에서 상세):**
- `admin`: 전체
- `accountant`: 전체 조회·수정 + 판관비 입력
- `sales`: 자기 담당 건만 입력·수정, 전체 조회는 옵션
- `viewer`: 조회만

---

## 3. DealCategory — 상품구분 (lookup)

```
deal_category
├─ id                    PK (small int 또는 code)
├─ code                  text UNIQUE      -- 'overseas', 'sales_agency' 등
├─ name_ko               text NOT NULL    -- '해외매체', '영업대행' 등
├─ commission_rate       numeric(5,4)     -- 0.1500 (현재 적용 요율)
├─ is_overseas           bool             -- 해외매체 1/N 룰 적용용
├─ is_special_share      text             -- IP/협찬 → 'narin_20' (특수 쉐어 룰 식별자)
├─ display_order         int
└─ memo                  text             -- 룰 메모 ("더영 소개건은 변경건")
```

**초기 시드 (15개):**
| code | name_ko | rate |
|---|---|---|
| outwall_self_seongsu | 외벽/자사(성수) | 0.10 |
| outwall_self_other | 외벽/자사(성수 외) | 0.10 |
| outwall_share_seongsu | 외벽/공판(성수) | 0.10 |
| outwall_share_other | 외벽/공판(성수 외) | 0.10 |
| exclusive_self | 전속/자사 | 0.10 |
| etc_self | 기타/자사 | 0.10 |
| fanclub_self | 팬클럽/자사 | 0.20 |
| fanclub_agency | 팬클럽/대행 | 0.30 |
| popup | 팝업 | 0.10 |
| overseas | 해외매체 | 0.15 (is_overseas=true) |
| sales_agency | 영업대행 | 0.30 |
| purchase_only | 매입건 | 0.00 |
| sponsorship_self | 협찬/자사 | 0.00 |
| ip | IP | 0.00 (is_special_share='narin_20') |
| han_river_bus | 한강버스 | 0.10 |
| china_biz | 중국사업 | 0.00 (별도 사업부) |

**요율 변경 이력은 P2** — 일단 현재 요율만 들고, 변경시 effective_from 컬럼 추가.

---

## 4. Account — 계정항목 (lookup)

```
account
├─ id                    PK
├─ code                  text UNIQUE
├─ name_ko               text NOT NULL
└─ display_order         int
```

**초기 시드:**
| code | name_ko |
|---|---|
| ad_fee | 광고비 |
| production_fee | 제작비 |
| deposit | 보증금 |
| contract_advance | 계약금 |
| advance | 선금 |
| balance | 잔금 |

> `광고비`/`광고료`, `제작비`/`제직비` 통합. 마이그레이션 때 텍스트→code 매핑.

---

## 5. SalesMethod — 매출수단 (lookup)

```
sales_method
├─ id                    PK
├─ code                  text UNIQUE
├─ name_ko               text NOT NULL
└─ display_order         int
```

**초기 시드:** tax_invoice(세금계산서), cash_receipt(현금영수증), card(카드결제), alipay(알리페이), bank_transfer(계좌이체)

---

## 6. ExpenseCategory — 거래항목 (lookup, 판관비용)

```
expense_category
├─ id                    PK
├─ code                  text UNIQUE
├─ name_ko               text NOT NULL    -- '(식대비)' 또는 '식대비'
├─ is_fixed_cost         bool             -- 매출장표의 고정비/변동비 구분
└─ display_order         int
```

**초기 시드 (사용빈도순):** meals/transport/commission_fee/welfare/donation/labor/books_print/office_rent/travel/marketing/office_supplies/entertainment/external_labor/postage/outsourcing/loan_interest/utility/communication/social_insurance/cargo/education ...

---

## 7. Deal — 거래 ⭐ 핵심 테이블

엑셀 한 행 = DB 한 행. 매출/매입을 한 row에 묶음 (분할 시에도 row 분리).

```
deal
├─ id                          PK (uuid)
├─ deal_code                   text UNIQUE NOT NULL  -- 'AZ260514-1'
├─ deal_code_base              text                  -- 'AZ260514' (분할 그룹핑용, generated)
├─ accrual_year                int  NOT NULL         -- 귀속연도
├─ accrual_month               int  NOT NULL         -- 1~12
├─ owner_user_id               FK→user
├─ category_id                 FK→deal_category
├─ account_id                  FK→account
├─ currency                    char(3) DEFAULT 'KRW' -- KRW/USD/CNY
├─ fx_rate                     numeric(10,4)         -- 외화 거래시
├─ status                      enum DEFAULT 'draft'  -- draft/confirmed/closed
│
│   -- 매출 (Sales side)
├─ sales_method_id             FK→sales_method
├─ issuer_counterparty_id      FK→counterparty       -- 매출세계 발행처
├─ advertiser_counterparty_id  FK→counterparty       -- 실광고주 (nullable)
├─ item_name                   text                  -- 품목명
├─ ad_start                    date
├─ ad_end                      date
├─ sales_amount_net            numeric(15,2)         -- 매출금 (VAT 제외)
├─ sales_vat                   numeric(15,2)
├─ sales_amount_gross          numeric(15,2)         -- 계산값 (저장 OK)
├─ sales_due_date              date                  -- 입금예정일
├─ sales_paid_date             date                  -- 실입금일
├─ sales_paid_status           enum                  -- pending/partial/completed
├─ sales_invoice_date          date                  -- 매출용 세계발행일
├─ sales_memo                  text
│
│   -- 매입 (Purchase side)
├─ supplier_counterparty_id    FK→counterparty       -- 매입처 (매체사)
├─ settlement_year             int                   -- 결산연도
├─ settlement_month            int                   -- 결산월 (1~12)
├─ purchase_pricing_raw        text                  -- "입금가", "0.1" 등
├─ purchase_amount_net         numeric(15,2)
├─ purchase_vat                numeric(15,2)
├─ purchase_amount_gross       numeric(15,2)
├─ purchase_due_date           date                  -- 결산예정일
├─ purchase_paid_date          date                  -- 지급일(결산일)
├─ purchase_paid_status        enum                  -- pending/completed
├─ purchase_invoice_date       date                  -- 매입용 세계발행일
├─ purchase_memo               text
│
│   -- 계산/캐시
├─ profit                      numeric(15,2)  generated -- sales_amount_net - purchase_amount_net
├─ commission_pct              numeric(5,4)            -- 성과급% (수동 입력 허용)
├─ commission_amount           numeric(15,2)           -- 성과급 (수동 또는 자동)
│
│   -- 메타
├─ vat_filed                   bool DEFAULT false     -- 부가세 신고 체크
├─ split_group                 text                   -- 분할 그룹 ID (deal_code_base와 동일 가능)
├─ created_at, updated_at, created_by, updated_by
│
└─ INDEX (accrual_year, accrual_month)
└─ INDEX (sales_paid_status, sales_due_date)
└─ INDEX (purchase_paid_status, purchase_due_date)
└─ INDEX (owner_user_id, accrual_year)
└─ INDEX (deal_code_base) -- 분할 거래 그룹핑
```

**설계 메모:**
- `deal_code_base`는 `regexp_replace(deal_code, '-\d+$', '')` generated column → 분할 그룹핑 쿼리 빠름
- `sales_amount_gross`, `purchase_amount_gross`, `profit`은 generated stored column (또는 BEFORE INSERT 트리거)
- 매출만/매입만 거래도 허용 → 매출 또는 매입 amount nullable
- `currency=KRW`가 기본, 외화는 fx_rate 함께 입력
- 분할 거래는 row를 분리해서 각각 입력 (엑셀 그대로)

**검증 룰 (애플리케이션 레벨):**
- `accrual_month BETWEEN 1 AND 12`
- `sales_vat ≈ sales_amount_net × 0.1` (±1 허용)
- `ad_start <= ad_end` (둘 다 있을 때만)
- 분할 거래일 때 `split_group` = `deal_code_base`

---

## 8. Expense — 판관비

```
expense
├─ id                    PK (uuid)
├─ expense_date          date NOT NULL
├─ year                  int  GENERATED   -- EXTRACT(YEAR FROM expense_date)
├─ month                 int  GENERATED
├─ item_name             text             -- 품목 (자유텍스트)
├─ amount                numeric(15,2) NOT NULL  -- VAT 포함 총액
├─ vat                   numeric(15,2)
├─ counterparty_id       FK→counterparty (nullable)  -- 마스터에 있을 때만
├─ counterparty_text     text             -- 영수증 상호 (마스터 없을 때, 식대 영수증 등)
├─ expense_category_id   FK→expense_category
├─ payment_method        enum             -- corporate_card / personal_card / cash / bank_transfer
├─ payer_user_id         FK→user          -- 지출자
├─ memo                  text
├─ receipt_url           text             -- S3/스토리지 영수증 이미지
├─ created_at, updated_at, created_by
└─ INDEX (year, month, expense_category_id)
```

**설계 메모:**
- 영수증 상호는 대부분 마스터에 없음 (식대 영수증 등 일회성) → `counterparty_text` 자유 입력 허용
- 마스터에 있는 거래처면 `counterparty_id` FK로 (자동완성 UX)
- 두 컬럼 중 하나는 NOT NULL — 둘 다 비면 안 됨

---

## 9. 보류 항목 (P2+에서 추가)

| 항목 | 추가 시점 | 방법 |
|---|---|---|
| 인센티브 요율 변경 이력 | 다음 룰 변경시 | `commission_rate_history` 테이블 + effective_from |
| 분할 거래 부모-자식 명시 | 사용자 요구시 | `parent_deal_id` 컬럼 추가 |
| 계좌(Account) 마스터 | 잔고 관리 필요시 | `bank_account` 테이블 + 거래에 FK |
| 환율 이력 | 외화 거래 늘면 | `fx_rate` 테이블 (날짜별) |
| 부가세 신고 묶음 | 분기 신고시 | `vat_filing` 테이블 (거래 N:M) |
| 세금계산서 마스터 | 발행 자동화시 | `tax_invoice` 별도 테이블 |
| 정기지급 (십일조 등) | 자동화시 | `recurring_payment` 테이블 |
| 첨부파일 | 계약서 첨부시 | `attachment` 테이블 (polymorphic) |

---

## 10. 자동 집계 뷰 (Read-only)

쿼리로 구현, 별도 테이블 불필요:

```sql
-- v_monthly_pnl_accrual : 귀속월 기준 월별 손익
SELECT accrual_year AS y, accrual_month AS m,
       SUM(sales_amount_net) AS revenue,
       SUM(purchase_amount_net) AS cogs,
       SUM(profit) AS gross_profit
FROM deal
GROUP BY accrual_year, accrual_month;

-- v_monthly_pnl_cash : 통장 기준
SELECT EXTRACT(YEAR FROM sales_paid_date) AS y,
       EXTRACT(MONTH FROM sales_paid_date) AS m,
       SUM(sales_amount_net) AS revenue_received
FROM deal WHERE sales_paid_date IS NOT NULL
GROUP BY 1, 2;

-- v_unpaid : 미입금/미결산 캘린더
SELECT * FROM deal
WHERE sales_paid_status != 'completed' AND sales_due_date IS NOT NULL
ORDER BY sales_due_date;

-- v_top_counterparty : 거래처 TOP
SELECT issuer_counterparty_id, accrual_year,
       SUM(sales_amount_gross) AS total_sales,
       SUM(profit) AS total_profit
FROM deal GROUP BY 1, 2;
```

---

## 11. 다음 단계

1. ✅ ERD 확정
2. ⏳ 마이그레이션 매핑 (엑셀 컬럼 → 테이블 컬럼)
3. ⏳ 권한 매트릭스 (User.role × 테이블별 CRUD)
4. ⏳ MVP 화면 와이어프레임 (Deal 입력 폼이 가장 큼)
5. ⏳ 기술스택 결정
