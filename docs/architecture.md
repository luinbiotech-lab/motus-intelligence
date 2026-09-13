# 구조 및 데이터 계약 v1.0

기존 저장소는 `.git`만 있고 커밋·코드·설정·데이터가 없는 상태였다. 기존 AI 뉴스 메일 및 AI 블로그 프로젝트를 탐색·수정·통합하지 않았다. 새 코드와 설정은 이 프로젝트에만 둔다.

```text
JSON 수동 입력
  → Normalize (형 변환 및 보간 없음)
  → Validate (envelope + 개별 레코드)
  → Deduplicate (후속 동일 값 제외)
  → Detect Conflict (양쪽 제외)
  → Identify Major Drivers (근거에 연결한 수동 신호)
  → Apply US-Korea Rules
  → Score Evidence
  → Cross Verify Claims (claim → evidence → source)
  → Generate Impact Candidates
  → Generate Blog Draft (구조화 JSON + Markdown)
  → Generate Evidence Package (JSON)
```

검증·중복·충돌은 한 번의 순회에서 수행하고 각각의 단계 결과로 노출한다. 중복 구현을 피하기 위한 구조다. 외부 언어모델에 원인을 추측시키지 않는다. 분석 실패는 검수 이슈로 남기고 원고·근거 생성을 이어간다. 입력 자체의 필수 구조 오류는 BLOCKED 원고와 오류 근거를 만든다. JSON 문법 오류나 파일 읽기 실패는 CLI에서 BLOCKED와 종료 코드 3을 반환한다.

## 공통 스키마

모든 입력 레코드에는 `id`, `sample`, `sourceId`, `sourceUrl`, `observedAt`, `collectedAt`, `unit`, `status`, `missingReasons`를 요구한다. 실제 레코드는 추가로 `collectionMode=MANUAL_VERIFIED|API`와 1개 이상의 `verificationUrls`를 요구한다. 샘플 레코드는 이전 fixture 호환을 위해 provenance 확장 필드를 선택값으로 둔다. Sprint 2B부터 핵심 수치는 선택적 `fieldProvenance`로 `sourceId`, `sourceUrl`, `observedAt`, `collectedAt`을 필드 단위에 붙일 수 있다. Sprint 2C부터 리포트 핵심 문장은 ClaimRecord로 분리해 `claimId → evidenceId → sourceId/sourceUrl` 경로를 보존한다.

| 엔터티 | 용도 |
| --- | --- |
| MarketSnapshot | 거래일·상품·종가·전일값·등락·등락률·거래량·통화 |
| MacroRelease | 발표시각·대상기간·실제·컨센서스·이전·수정 이전·조정 방식 |
| CompanyEvent | 기업·이벤트 유형·발생시각·제목·요약·공식 링크 |
| FilingRecord | 양식·접수번호·공시시각·기간·추출 사실·선택적 CIK/company/primaryDocument/filingUrl |
| NewsReference | 제목·발행사·시각·링크·관련 종목/산업·검증 사실만 |
| KoreaImpactCandidate | 원인 이벤트·규칙·전달경로·산업·방향·강도·근거·신뢰도·반대변수 |
| ReportRecord | reportId·거래일·생성시각·버전·검수상태·목차·제목·3줄 요약 |
| EvidenceRecord | 원본·출처·시각·단위·계산·규칙 버전·사용 목차·검증 상태 |
| ClaimRecord | 주장 문장·유형·값·검증상태·출처 묶음·confidence score |
| ConflictRecord | claim별 출처 간 수치/시각/서술/당사국 주장 충돌 |
| GeoVerificationContext | 지정학 이벤트의 당사국·중립·공식 출처 균형 |

입력·Source·Rule은 런타임 스키마와 TypeScript 타입을 모두 사용한다. 출력 엔터티는 TypeScript 타입 계약이며 외부 출력 수입용 런타임 스키마는 이번 범위가 아니다. `schemaVersion=1.0` 이외의 입력은 거부한다. 미등록 필드와 숫자 문자열도 자동 변환하지 않는다.

`null`은 실제 값 부재에만 사용하고 `missingReasons.<field>`에 이유가 있어야 한다. 핵심 값(close, previousClose, actual) 부재는 분석 제외. 지수·금리처럼 거래량이 구조적으로 없거나 내부 원고에 사용하지 않는 경우에는 volume null과 missingReasons.volume을 허용한다. 선택값(예: consensus) 부재는 NO_DATA 검수 항목을 남기되 나머지 사실은 사용할 수 있다. 계산 결과는 원본 레코드를 덮어쓰지 않고 evidence.calculation의 raw/display에 별도 보존한다.

정보 성격은 CONFIRMED_FACT / CALCULATED / INFERENCE / EXPECTATION / OPINION으로 나눈다. 입력 사실의 CONFIRMED_FACT 표시는 **사용자가 수동 확인한 사실이라는 계약**이며, 코드가 원문 진위를 자동 인증했다는 의미가 아니다. 한국 영향은 항상 INFERENCE다. 종목 연결은 이번 단계에서 수행하지 않아 koreaCompanyId/koreaTicker는 명시적 null이다.

Claim type은 MARKET_FACT, MACRO_FACT, CORPORATE_FACT, POLICY_FACT, GEOPOLITICAL_FACT, CAUSAL_INTERPRETATION, MARKET_REACTION, KOREA_IMPACT로 나눈다. 사실 claim과 분석 claim은 다른 규칙으로 검증한다. Tier A 공식 수치/공시는 단일 공식 출처로 VERIFIED 가능하지만, CAUSAL_INTERPRETATION과 KOREA_IMPACT는 단일 출처만으로 VERIFIED가 되지 않는다. CONFLICT, UNVERIFIED, INSUFFICIENT_SOURCES claim은 자동 본문에서 제외한다.

confidenceScore는 규칙 기반이다. VERIFIED 80, PRIMARY_SOURCE_ONLY 75, PARTIALLY_VERIFIED 60, INSUFFICIENT_SOURCES 40, UNVERIFIED 25, CONFLICT 15, REJECTED 0을 기본으로 두고, Tier A 공식 출처 +10, 독립 출처 다양성 최대 +10, 지정학 균형 +5, contradicting/unresolved source 페널티를 적용한다. 점수는 0~100으로 제한한다.

Review queue는 CRITICAL/HIGH conflict, UNVERIFIED, REVIEW_REQUIRED, PARTIALLY_VERIFIED, INSUFFICIENT_SOURCES, 정상 VERIFIED 순으로 우선한다. approvalStatus는 자동 생성 후 검증 결과에 따라 AUTO_VALIDATED 또는 REVIEW_REQUIRED/BLOCKED가 되며, APPROVED 전 publish action은 BLOCKED로 전환된다.

## 근거 및 보존

근거 패키지는 원본 입력 SHA-256, 출처 설정 전체, 규칙 전체, 원본값, 계산식과 raw/display, 판단, 검증 결과, 단계 결과, 원고 문장, 수동 검수 및 발행 상태를 포함한다. reportId는 입력·출처·규칙을 해시한 값으로 연결한다.

뉴스 전문 저장 금지가 원본 보존보다 우선한다. 뉴스의 미등록 필드는 출력 전에 제거하고 `redactedFields`에 경로만 기록한다. 허용된 verifiedFacts에는 짧은 확인 사실만 입력하며 전문을 넣지 않는다. 의미적으로 기사를 판별하는 NLP는 없다. `aiGeneratedText.used=false`로 실제 AI 미사용을 명시하며, 생성된 모든 문장은 reportMetadata.sections에 남는다.

RetrospectiveRecord는 국내 실제 결과의 evidence ID, 예상 전달경로, 설명력, 반대변수, 규칙 개선 필요성을 보관하는 확장 타입이다. 적중률·수익률 평가 기능은 없다.
