# Sprint 2C 완료 보고

검증 시각: 2026-09-13T08:30:11Z  
시작 commit: 88f66835240f4580c02ce1da209efbc447e9cf3c

1. 시작 commit: `88f66835240f4580c02ce1da209efbc447e9cf3c`.

2. 기존 regression: Treasury/BLS/SEC 어댑터, fieldProvenance, golden day, validation, US-Korea rule, blog generator 테스트를 유지했다.

3. Claim 모델: `ClaimRecord`를 추가했다. claimId, claimType, subject/predicate/value, verificationStatus, confidenceScore, supporting/contradicting/unresolved sources, sourceDiversity, geopoliticalContext, informationType, marketRelevance를 보존한다.

4. Cross Verification Engine: `verifyClaims`와 `buildClaimsFromOutcome`을 추가했다. 기사 단위가 아니라 claim 단위로 검증하고, 본문 사용 가능 claim만 report item에 연결한다.

5. Source Tier: Source Registry에 `verificationTier`를 추가했다. 공식 기관·거래소·통계·공시·IR 출처는 Tier A, 기타 보조 출처는 Tier D로 시작한다. 주요 매체 Tier B/C는 registry 확장으로 관리한다.

6. Conflict Detection: `ConflictRecord`를 추가했다. 숫자값, 시각, 사건 여부, 원인 서술, 당사국 주장 충돌을 표현할 수 있다. 현재 구현은 numeric value와 narrative contradicting source를 테스트한다.

7. Geopolitical Verification: `GeoVerificationContext`를 추가했다. party A, party B, neutral, official source를 분리하고, 한쪽 출처만 있는 지정학 claim은 REVIEW_REQUIRED로 둔다.

8. Confidence Score: 규칙 기반 점수로 구현했다. VERIFIED, PARTIALLY_VERIFIED, CONFLICT 등 상태별 base score에 Tier A, 출처 다양성, 지정학 균형, 미해결/반박 출처 penalty를 적용한다.

9. Report Traceability: report item에 선택적 `claimIds`를 추가했다. 문장 → claim → evidence → source 경로를 evidence package에서 추적할 수 있다. CONFLICT/UNVERIFIED/INSUFFICIENT_SOURCES claim은 자동 본문에 쓰지 않는다.

10. Review Queue: `buildReviewQueue`를 추가했다. HIGH/CRITICAL conflict, UNVERIFIED, REVIEW_REQUIRED, PARTIALLY_VERIFIED, INSUFFICIENT_SOURCES 순으로 문제 항목을 우선한다.

11. Approval Flow: `approvalStatus`와 상태 전환 함수를 추가했다. APPROVED 전 publish action은 BLOCKED가 된다. 현재 Blogger 자동 게시 기능은 없다.

12. BLS Calendar: BLS releaseTime 전 collectedAt이면 `NOT_RELEASED`를 반환한다. SCHEDULED는 상태 enum에는 추가했지만 별도 calendar adapter는 아직 없다.

13. SEC Timestamp: `acceptedAt`, `filedDate`, `timestampPrecision`을 추가했다. accepted timestamp가 옵션으로 확보되면 `ACCEPTED_TIMESTAMP`, submissions filingDate만 있으면 `DATE`로 기록한다.

14. Golden Day 결과: 2026-09-11 golden day에 `claims.json`을 추가했다. API 혼합 입력 기준 claim 15개, conflict 0개, approvalStatus AUTO_VALIDATED다.

15. Tests: 기존 47개에 claim, conflict, geopolitical, report traceability, review queue, approval flow, BLS not released, SEC timestamp 테스트를 추가해 54개 PASS.

16. Typecheck/build: `npm.cmd run typecheck` PASS, `npm.cmd run build` PASS.

17. Secret scan: committed source scope에서 credential pattern 없음.

18. PASS: Cross Verification Engine, ClaimRecord, ConflictRecord, GeoVerificationContext, Source Tier, confidence score, report claim traceability, review queue, approval flow, BLS not released, SEC timestamp precision, golden day cross verification, typecheck/build/test/json integrity/sample/API-mixed E2E.

19. FAIL: 없음.

20. 미검증: 실제 다국가 지정학 원문 수집, Reuters/AP/Bloomberg 등 Tier B registry 확장, BLS schedule 전용 adapter, SEC accepted timestamp 자동 확보, 실제 사람 검수 시간 측정, Blogger 게시.

21. 변경파일: `src/domain/models.ts`, `src/data/schemas.ts`, `src/data/adapters.ts`, `src/services/cross-verification.ts`, `src/services/review.ts`, `src/services/pipeline.ts`, `src/services/report.ts`, `src/services/validation.ts`, `tests/pipeline.test.ts`, `scripts/build-golden-claims.mjs`, `config/sources.json`, README, docs, golden claims.

22. 운영 위험: 분석 claim은 여러 evidence를 묶기 때문에 단순 값 비교를 충돌로 쓰면 오판한다. 현재는 명시 contradicting source 중심으로 처리한다. 지정학 claim의 당사국 출처 자동 수집은 아직 구조만 있다.

23. 다음 Sprint 제안: Tier B/C 출처 registry를 추가하고, BLS release calendar adapter와 SEC accepted timestamp 확보 adapter를 분리하며, review queue를 사람이 바로 볼 수 있는 검수표로 출력한다.
