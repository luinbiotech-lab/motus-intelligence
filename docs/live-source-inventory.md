# Production live source inventory

Production 기본 경로는 `InternalLiveDailyAdapter`다. 각 adapter는 공개 원천을 직접 읽고 기존 Daily ViewModel, Blogger editorial renderer, verification gate로 연결한다. `HttpVerifiedDailyAdapter`는 외부 통합용 선택지로만 유지하며 workflow에서는 사용하지 않는다. Snapshot은 명시적 regression 옵션이며 verification에서 publish-ready가 될 수 없다.

| Category | Source | Data | Credential | Failure behavior |
|---|---|---|---|---|
| U.S. Market | FRED CSV | S&P 500, Nasdaq Composite, Dow Jones, VIX, U.S. 10Y, Brent | 없음 | 누락·stale·63-session 미달 시 HOLD |
| U.S. Market | Twelve Data time series | Russell 2000, DXY | `TWELVE_DATA_API_KEY` | 키/series 누락 시 HOLD |
| AI | OpenAI, Google AI, NVIDIA, Microsoft official RSS | 공식 발표 headline, timestamp, summary, article URL | 없음 | 최근 검증 event 2건 미만이면 정상 SKIP |
| Korea primary | Naver Finance public market APIs | KOSPI, KOSDAQ, USD/KRW, investor flows, sectors, movers | 없음 | 동일 기준일/필수값 미완성 시 HOLD |
| Korea official | KRX Open API | KOSPI/KOSDAQ official daily close | `KRX_AUTH_KEY` | 키·응답·기준일 누락 또는 허용오차 초과 시 HOLD |
| Korea official optional | Bank of Korea ECOS | USD/KRW official cross-check when available | `BOK_ECOS_API_KEY` | KRX index comparison을 대체하지 않으며 실패 내역을 audit에 보존 |
| Macro/filings | 기존 Treasury, BLS, SEC adapters | 공식 거시·공시 확장 경계 | 기존 adapter 정책 | Daily 필수값을 대체하거나 합성하지 않음 |

모든 public source URL은 `live-source-audit.json`과 `verification.json`에 연결한다. Korea는 `cross-verification.json`에 primary/independent source, 비교 필드, 허용오차, 결과를 별도로 기록한다. 서로 독립적인 두 개 이상의 provider domain을 확인하지 못하면 단일 사업자의 여러 endpoint가 성공해도 publish-ready로 승격하지 않는다. Source 성공 여부, provenance, source anchor, mobile, editorial quality, leakage, article fingerprint 중 하나라도 실패하면 `REVIEW_REQUIRED/HOLD`다. Search Intelligence는 검증된 `live-unit.json` 이후에만 실행되며 provider 장애가 core Daily 상태를 승격하거나 강등하지 않는다.
