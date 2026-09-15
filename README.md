# 미국 주식시장 마감 리포트 — Sprint 2H

미국 마감 자료를 수동 입력하거나 일부 공식 어댑터로 수집하여 검증 → claim 단위 교차검증 → 조건부 한국시장 영향 → 사람 검수표 → publish-ready 초안 → 공개용 editorial 출력 → 내부 관리자용 A4 MASTER 리서치 포스터까지 만드는 **비공개 로컬 CLI**입니다. Google Blogger용 Daily Editorial Renderer, B/C/D Content Opportunity Engine, 약어 우선 금융용어 해설, SEO/Naver package, 내부 관리자용 A4 MASTER HTML/PDF/PNG Renderer와 Blogger API v3 초안 생성 어댑터가 연결돼 있습니다. 2026-09-11을 golden day로 사용합니다. 실제 Blogger 쓰기는 preview와 사람 승인을 거친 뒤, blogId와 OAuth access token이 모두 환경 변수에 있을 때만 실행합니다.

## 실행

Node.js 24 이상과 npm이 필요합니다. 개발 의존성은 lockfile로 고정합니다.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run sample
```

실제 수동 자료는 [수동 입력 안내](docs/manual-input.md)에 따라 준비한 뒤 실행합니다.

```powershell
npm.cmd run report -- --input data/manual/day.json
npm.cmd run report -- --input data/manual/2026-09-11/input.json
npm.cmd run build
node scripts/build-golden-day.mjs
node scripts/build-golden-claims.mjs
npm.cmd run report -- --input data/manual/2026-09-11/input-api.json
node dist/src/cli.js --review data/evidence/<reportId>.json
node dist/src/cli.js --apply-review-actions data/evidence/<reportId>.json data/reports/<reportId>.json data/reviews/YYYY-MM-DD/actions.json
node dist/src/cli.js --editorial data/reports/<reportId>.json data/evidence/<reportId>.json
node dist/src/cli.js --brokerage-report data/reports/<reportId>.json data/evidence/<reportId>.json
node dist/src/cli.js --a4-master data/reports/<reportId>.json data/evidence/<reportId>.json
node dist/src/cli.js --a4-master data/reports/<reportId>.json data/evidence/<reportId>.json --regenerate
node dist/src/cli.js --blogger-preview data/reports/<reportId>.json data/evidence/<reportId>.json
node dist/src/cli.js --blogger-approve data/blogger/YYYY-MM-DD/<reportId>-publication.json
Set-Item Env:BLOGGER_BLOG_ID '<Google Blogger blog ID>'
Set-Item Env:BLOGGER_OAUTH_TOKEN '<OAuth 2.0 access token with Blogger scope>'
node dist/src/cli.js --blogger-publish data/blogger/YYYY-MM-DD/<reportId>-publication.json
```

`report`는 빌드된 CLI를 사용합니다. 코드 수정 후 `npm.cmd run build`를 실행하세요. `sample`과 `test`는 자동으로 빌드합니다. 경로는 프로젝트 루트 기준입니다.

결과는 `data/reports/<reportId>.md`, `data/reports/<reportId>.json`, `data/evidence/<reportId>.json`에 저장됩니다. Review Sheet는 `data/reviews/YYYY-MM-DD/`, publish-ready 초안·diff·reviewed evidence는 `data/publish-ready/YYYY-MM-DD/`에 저장됩니다. Editorial 출력은 `data/editorial/YYYY-MM-DD/`, 내부 A4 MASTER는 `data/a4-master/YYYY-MM-DD/`, 이전 내부 요약은 `data/brokerage/YYYY-MM-DD/`에 저장됩니다. 같은 입력·출처 설정·규칙은 같은 reportId를 사용하며 다시 실행하면 파생 출력이 갱신됩니다. A4 MASTER는 `reportId + rendererVersion` 기준으로 캐시하고 `--regenerate`를 지정할 때만 새로 씁니다. `data/reports`와 `data/evidence` 출력 파일은 Git에서 제외합니다.

## 결과 해석

| CLI 상태 | 의미 | 종료 코드 |
| --- | --- | --- |
| PASS | 입력 처리 및 생성 검증 통과. 발행 승인 아님 | 0 |
| REVIEW_REQUIRED | 누락·충돌·지연·저신뢰·중복 등 검수 필요 | 0 |
| FAILED | 개별 입력에 잘못된 타입·수치 등이 있음. 유효 자료는 계속 처리 | 2 |
| BLOCKED | 입력 envelope·설정·거래일 정보가 유효하지 않음 | 3 |

검수 목록이 원고와 CLI에서 먼저 표시됩니다. 근거 패키지는 `manualReviewStatus=PENDING`, `publishStatus=BLOCKED`가 기본입니다. `approvalStatus=AUTO_VALIDATED|REVIEW_REQUIRED|APPROVED|BLOCKED|PUBLISHED`를 별도로 보존하며, APPROVED 전 발행은 차단합니다. Sprint 2D부터 수동 action이 없으면 `AUTO_VALIDATED`를 자동으로 `APPROVED`로 승격하지 않습니다. 샘플의 PASS는 테스트 성공만 뜻하며 샘플 발행은 금지합니다.

공개 Blogger/Naver 출력에는 내부 `claimId`, `reportId`, approval status, pipeline status를 표시하지 않습니다. B/C/D 콘텐츠는 Daily A와 달리 항상 생성하지 않고 opportunity 판단 결과로 추천 여부만 기록합니다. 금융용어 해설은 공개 본문에 실제 등장한 용어만 3~8개로 제한하고 Evergreen 연결 키를 함께 보존합니다.

A4 MASTER 생성은 관리자 전용 boundary를 통과해야 하며, 공개 route에서 호출할 수 없습니다. 개발환경에서는 `src/services/admin.ts`의 server-side authorization boundary와 `data/a4-master/YYYY-MM-DD/admin-a4-route.html`로 내부 route 화면을 분리합니다.

실제 Blogger 연결 설정은 `config/publishing.json`에 환경 변수 이름과 `publishAsDraft` 정책만 저장합니다. blogId와 access token 값은 저장소 파일에 기록하지 않습니다. 기본값 `publishAsDraft=true`는 Google Blogger API v3 `posts.insert?isDraft=true`를 사용합니다. 둘 중 하나라도 없으면 외부 요청을 보내지 않고 실패 상태를 기록합니다. 초안 생성 후 반환된 post URL은 publication record에 저장되며, A4를 `--regenerate`로 다시 만들면 CTA/QR과 Naver package에 같은 URL이 반영됩니다.

## 중요한 파일

- `src/domain/models.ts`: 공통 엔터티 8종, 판단 필드, 사후 설명력 평가 모델
- `src/data/schemas.ts`: 수동 입력·출처·규칙의 엄격한 런타임 스키마
- `config/sources.json`: 실제/테스트 출처 registry. `US_TREASURY`, `BLS`, `SEC_EDGAR` 공식 어댑터 연결
- `config/us-korea-rules.v1.json`: 10개 대표 산업, 12개 전달경로를 다루는 13개 규칙
- `src/services/validation.ts`: 입력 검증, 중복·충돌 격리
- `src/services/analysis.ts`: 근거별 규칙 점수화
- `src/services/pipeline.ts`: 단계 상태, 부분 실패 처리, 근거 패키지
- `src/services/report.ts`: 9개 목차와 Markdown 생성
- `src/services/cross-verification.ts`: ClaimRecord, ConflictRecord, 지정학 검증, confidence score
- `src/services/review.ts`: review queue, review sheet, manual action, approval gate, publish-ready draft, machine/human diff
- `src/services/editorial.ts`: Blogger Daily renderer, B/C/D opportunity engine, dynamic glossary, Naver intro, on-demand A4 brokerage renderer
- `src/services/a4-visual.ts`: A4 MASTER HTML/PDF/PNG renderer, Naver posting package, cache metadata
- `src/services/admin.ts`: admin-only A4 generation boundary와 route HTML
- `src/services/blogger.ts`: Blogger publication state machine, dry-run adapter, Google Blogger API v3 draft adapter
- `config/publishing.json`: Blogger URL 정책, 환경 변수 이름, draft-first 설정
- `data/fixtures/sample-day.json`: 실행 가능한 통합 샘플. 분리된 sample-*.json은 각 입력 영역의 예시
- `data/manual/2026-09-11/input.json`: 2026-09-11 실제 정규 거래일 수동 검증 리허설 입력
- `data/manual/2026-09-11/input-api.json`: Treasury/BLS/SEC 어댑터 산출물을 일부 투입한 golden day 입력
- `data/golden/2026-09-11/`: 원본 source snapshot, expected normalized result, manual/API 비교표, claim 검증 결과
- `tests/pipeline.test.ts`: 요구 시나리오와 회귀 테스트

[구조](docs/architecture.md) · [수동 입력](docs/manual-input.md) · [규칙](docs/rules.md) · [출처 운영](docs/data-sources.md) · [문제 및 회귀 방지](docs/issues.md) · [Sprint 1 완료 보고](docs/sprint-report.md) · [Sprint 2A 완료 보고](docs/sprint-2a-report.md) · [Sprint 2B 완료 보고](docs/sprint-2b-report.md) · [Sprint 2C 완료 보고](docs/sprint-2c-report.md) · [Sprint 2D 완료 보고](docs/sprint-2d-report.md) · [Sprint 2E 완료 보고](docs/sprint-2e-report.md) · [Sprint 2F 완료 보고](docs/sprint-2f-report.md) · [Sprint 2G 완료 보고](docs/sprint-2g-report.md) · [Sprint 2H 진행 보고](docs/sprint-2h-report.md)
