# 미국 주식시장 마감 리포트 — Sprint 2A

미국 마감 자료를 수동 입력하여 검증 → 조건부 한국시장 영향 → 블로그 초안 → 근거 JSON을 만드는 **비공개 로컬 CLI**입니다. Sprint 2A에서는 실제 완료 정규 거래일 1건을 `MANUAL_VERIFIED` 입력으로 리허설했고, 첫 공식 데이터 어댑터로 U.S. Treasury 일별 CSV에서 2년/10년 금리를 정규화합니다. 자동 발행, 스케줄러, 투자 추천은 연결하지 않았습니다.

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
```

`report`는 빌드된 CLI를 사용합니다. 코드 수정 후 `npm.cmd run build`를 실행하세요. `sample`과 `test`는 자동으로 빌드합니다. 경로는 프로젝트 루트 기준입니다.

결과는 `data/reports/<reportId>.md`, `data/reports/<reportId>.json`, `data/evidence/<reportId>.json`에 저장됩니다. 같은 입력·출처 설정·규칙은 같은 reportId를 사용하며 다시 실행하면 파생 출력이 갱신됩니다. 과거 실행별 영구 보관은 다음 Sprint 범위입니다. 출력 파일은 Git에서 제외합니다.

## 결과 해석

| CLI 상태 | 의미 | 종료 코드 |
| --- | --- | --- |
| PASS | 입력 처리 및 생성 검증 통과. 발행 승인 아님 | 0 |
| REVIEW_REQUIRED | 누락·충돌·지연·저신뢰·중복 등 검수 필요 | 0 |
| FAILED | 개별 입력에 잘못된 타입·수치 등이 있음. 유효 자료는 계속 처리 | 2 |
| BLOCKED | 입력 envelope·설정·거래일 정보가 유효하지 않음 | 3 |

검수 목록이 원고와 CLI에서 먼저 표시됩니다. 원고는 `REVIEW_REQUIRED`, 근거 패키지는 `manualReviewStatus=PENDING`, `publishStatus=BLOCKED`가 기본입니다. 샘플의 PASS는 테스트 성공만 뜻하며 샘플 발행은 금지합니다.

## 중요한 파일

- `src/domain/models.ts`: 공통 엔터티 8종, 판단 필드, 사후 설명력 평가 모델
- `src/data/schemas.ts`: 수동 입력·출처·규칙의 엄격한 런타임 스키마
- `config/sources.json`: 실제/테스트 출처 registry. `US_TREASURY`만 Sprint 2A 공식 CSV 어댑터 연결
- `config/us-korea-rules.v1.json`: 10개 대표 산업, 12개 전달경로를 다루는 13개 규칙
- `src/services/validation.ts`: 입력 검증, 중복·충돌 격리
- `src/services/analysis.ts`: 근거별 규칙 점수화
- `src/services/pipeline.ts`: 단계 상태, 부분 실패 처리, 근거 패키지
- `src/services/report.ts`: 9개 목차와 Markdown 생성
- `data/fixtures/sample-day.json`: 실행 가능한 통합 샘플. 분리된 sample-*.json은 각 입력 영역의 예시
- `data/manual/2026-09-11/input.json`: 2026-09-11 실제 정규 거래일 수동 검증 리허설 입력
- `tests/pipeline.test.ts`: 요구 시나리오와 회귀 테스트 41개

[구조](docs/architecture.md) · [수동 입력](docs/manual-input.md) · [규칙](docs/rules.md) · [출처 운영](docs/data-sources.md) · [문제 및 회귀 방지](docs/issues.md) · [Sprint 1 완료 보고](docs/sprint-report.md) · [Sprint 2A 완료 보고](docs/sprint-2a-report.md)
