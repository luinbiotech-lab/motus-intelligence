# Sprint 2B 완료 보고

검증 시각: 2026-09-13T08:30:11Z  
Baseline commit: 6864e00d4fe852a093fe4669c6df70117514a81f

1. 시작 repository 상태: `master`, unborn HEAD, 전체 프로젝트 파일 untracked였다. 2A 검증 후 최초 baseline commit을 만들었다.

2. Sprint 2A 보완 결과: 누락됐던 `npm.cmd run build`를 별도 실행했고 PASS를 확인했다. JSON 무결성 검사 스크립트를 추가했다.

3. build 검증: `npm.cmd run build` PASS.

4. JSON 무결성: `docs/verification-sprint-2a.json`, manual/golden 입력, `data/evidence/*.json`, `data/reports/*.json`을 parse하고 duplicate key, reportId consistency, evidence/report shape를 검사했다.

5. baseline commit hash: `6864e00d4fe852a093fe4669c6df70117514a81f`.

6. BLS Adapter: `BlsCpiAdapter`를 추가했다. BLS Public Data API에서 CPI index를 읽고 CPI m/m actual/previous를 계산한다. BLS는 consensus를 제공하지 않으므로 생성하지 않는다. 공식 API 설명: https://www.bls.gov/developers/api_signature_v2.htm

7. SEC Adapter: `SecEdgarAdapter`를 추가했다. `data.sec.gov/submissions/CIK##########.json`에서 8-K/10-Q/10-K metadata를 정규화하고 User-Agent와 최소 호출 간격을 적용한다. SEC data API 안내: https://data.sec.gov/ 및 https://www.sec.gov/about/webmaster-frequently-asked-questions

8. Treasury regression: 기존 `TreasuryYieldAdapter` 테스트와 실사용 경로를 유지했고, symbol별 `recordIds` 옵션과 field provenance를 추가했다.

9. provenance: `fieldProvenance` 구조를 도메인 모델, 스키마, evidence record에 추가했다. Treasury yield, BLS CPI actual/previous, SEC filing metadata에서 필드 단위 출처가 생성된다.

10. Golden Day 비교: 2026-09-11을 첫 golden trading day로 지정했다. `data/golden/2026-09-11/source-raw.json`, `expected-normalized.json`, `comparison.json`을 분리했다. 비교에서 US2Y, US10Y, CPI actual, SEC accession은 MATCH다. CPI previous는 manual 0.1 vs API 0.07, SEC filedAt은 accepted timestamp vs submissions filingDate 차이로 REVIEW_REQUIRED다. CPI consensus는 BLS Adapter에서 의도적으로 null이다.

11. tests: 기존 41개를 유지하고 BLS, SEC, provenance, golden day 비교 테스트를 추가해 47개 PASS.

12. typecheck/build: `npm.cmd run typecheck` PASS, `npm.cmd run build` PASS.

13. secret scan: committed source scope에서 credential pattern 없음.

14. PASS: baseline commit, build, typecheck, tests, sample E2E, manual real E2E, API-mixed real E2E, JSON parse, Treasury/BLS/SEC adapter mock tests, BLS/SEC live adapter smoke, field provenance, golden day comparison.

15. FAIL: 없음.

16. 미검증: 시장 데이터 재배포/상업 이용 조건, 자동 Blogger 게시, 실제 인간 검수 10~20분 측정, SEC 전문 분석, 전체 종목 수집, BLS consensus 공급원 자동화.

17. 변경파일: `src/data/adapters.ts`, `src/domain/models.ts`, `src/data/schemas.ts`, `src/services/pipeline.ts`, `src/services/validation.ts`, `tests/pipeline.test.ts`, `scripts/check-json-integrity.mjs`, `scripts/build-golden-day.mjs`, `config/sources.json`, README와 docs, golden/manual API 입력.

18. 운영상 위험: BLS API index 재계산값과 발표문 rounded 값이 다를 수 있다. SEC submissions는 accepted timestamp가 아니라 filingDate 중심이다. 이 차이는 comparison에 REVIEW_REQUIRED로 남긴다.

19. 다음 Sprint 제안: BLS release calendar/source를 분리하고, SEC accepted timestamp 확보 경로를 추가하며, field별 provenance UI 또는 검수표를 만들고, Blogger 게시 전 승인 흐름을 설계한다.
