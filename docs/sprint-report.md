# Sprint 0 + Sprint 1 결과

## 1. 현재 상태

로컬 수동 입력 기반 MVP가 구현되었다. 대표 SAMPLE 입력에서 검증 → 규칙 분석 → 한국 영향 후보 → 블로그 원고 → 구조화 근거 패키지가 실행된다. 운영 데이터 자동 수집과 자동 발행은 미연결이다.

## 2. 변경 파일

신규 빈 저장소이므로 기존 수정 파일 없이 신규 파일을 생성했다.

- 기반: package.json, package-lock.json, tsconfig.json, .gitignore, README.md
- 모델/스키마: src/domain/models.ts, src/data/schemas.ts
- 출처/규칙: config/sources.json, config/us-korea-rules.v1.json
- 실행: src/cli.ts, src/data/adapters.ts, src/utils/calculations.ts
- 서비스: src/services/validation.ts, analysis.ts, pipeline.ts, report.ts
- 샘플: data/fixtures/sample-day.json 및 market/macro/company-events/filings/news/korea-context 6개 영역 예시
- 검증: tests/pipeline.test.ts
- 운영 문서: docs/architecture.md, manual-input.md, rules.md, data-sources.md, issues.md, sprint-report.md, verification.json
- 실행 산출물: data/reports/*.md 및 *.json, data/evidence/*.json (Git 제외)

## 3. 구현 내용

엄격한 입력 검증, 원본/표시값 분리, 레코드 격리, 수동 신호 기반 주요 원인 식별, 규칙 점수화, 9개 고정 목차, 근거 연결, 단계 상태 및 검수 우선 출력. API 어댑터 확장 인터페이스는 미연결 결과만 반환한다. 공개 UI 없이 CLI를 사용한다.

## 4. 데이터 스키마

요청된 8개 엔터티와 공통 provenance, 12개 운영 상태, 5개 정보 성격, 영향 방향·강도·근거·유효기간을 정의했다. 수동 입력은 schemaVersion 1.0, Source/Rule은 설정 파일 런타임 검증을 사용한다. 사후 설명력 평가 타입도 마련했다.

## 5. 분석 Rule

10개 대표 산업, 12개 전달경로, 13개 규칙. 근거 수·공식 분류·반대변수·누락 여부로 재현 가능한 점수를 산출한다. 근거 부족은 HOLD/LOW_CONFIDENCE. 개별 한국 종목 추천·연결은 없다.

## 6. 검증 로직

필수 필드·타입·날짜/시간대·거래일·마감 기준시각·수집 순서·통화·단위·원본 계산·소수점 2자리 등락률·출처 존재/공식 여부·중복·충돌·지연·결측 사유·값 범위를 검사한다. 전일값 0과 계산 오버플로는 INVALID_VALUE. 잘못된 레코드는 사실/추론 생성에서 제외하고 근거에 남긴다. 미등록 뉴스 필드는 저장하지 않는다.

## 7. 테스트 결과

최종 명령별 종료 코드 및 검증 시각은 verification.json에 저장한다. 필수 10개 시나리오(정상·결측·출처누락·중복·충돌·전일값0·지연·저신뢰·휴장·조기마감)와 추가 회귀 테스트를 실행한다. 대표 CLI sample은 9개 목차, 영향 후보 1개, 원본 근거 5개, 동일 reportId 연결을 생성한다. BLOCKED 검증 이슈는 실행 전체를 BLOCKED로 승격한다.

## 8. PASS / FAIL / 미검증

- PASS: 타입체크, 빌드, 자동 테스트, 샘플 E2E. 최종 수치는 verification.json 참조.
- FAIL: 해결되지 않은 자동 검증 실패는 최종 verification.json의 exitCode로 확인한다.
- 미검증: 실제 API 인증/연결/시세, 실제 원문 진위, 시장 캘린더 자동 정확성, 약관/상업적 이용, 실거래일 초안 품질, 10~20분 검수 소요시간, Blogger 연동. 의도적으로 이번 단계에서 연결하지 않았다.
- 발행 상태: 테스트 PASS와 관계없이 BLOCKED, 사용자 검수 PENDING.

## 9. 문제 원인

초기 package name, 오프라인 의존성 설치, Node 타입 설정, union 배열 타입 추론, 테스트 프로세스 실행 제한, Markdown 이스케이프 기대값 문제를 해결했다. 뉴스 전문 보존 가능성·중복 신호·산술 오버플로도 점검해 회귀 방지를 추가했다. 상세는 issues.md에 기록했다.

## 10. 기존 기능 영향

기존 코드가 없는 저장소였고 다른 AI 뉴스/블로그 프로젝트는 수정하지 않았다. 기존 자동화 또는 발행 시스템에 연결하지 않았다.

## 11. 데이터 호환성

JSON 입력 v1.0을 사용한다. 알 수 없는 필드·버전과 숫자 문자열은 거부한다. 샘플/실제 혼용을 차단한다. source registry enabled=false는 자동 수집 미연결 상태이며 직접 확인한 수동 입력을 금지하지 않는다. 과거 데이터 마이그레이션은 대상이 없었다.

## 12. 남은 작업

실제 하루치 수동 자료 검수, 필드별 복수 출처 구조, 공식 거래일/일정 연결, 출처 URL/문서 진위 확인, 신규 무료 adapter의 약관 및 rate limit 확인, 실행별 불변 보관과 사람 검수 이력 저장.

## 13. 다음 Sprint 제안

실제 1거래일 수동 운영 리허설로 먼저 누락·원고 품질·검수 시간을 측정한다. 그 결과를 바탕으로 무료 공식 출처 하나를 선정하여 약관·출처 계약을 확인하고 adapter를 연결한다. 이후 거래일 캘린더, 검수 이력 및 사후 설명력 기록을 확장한다. 자동 발행은 별도 승인된 범위에서 다룬다.
