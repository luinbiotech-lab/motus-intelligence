# Sprint 2D 완료 보고

검증 시각: 2026-09-14T07:40:00+09:00  
시작 commit: `e3c6c4c877abbd0debdecef394b9c821af9a72f3`

1. 시작 commit: `e3c6c4c877abbd0debdecef394b9c821af9a72f3`.

2. Regression 결과: 시작 전 `git status --short`, `git log --oneline -3`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd test`, `npm.cmd run sample`을 실행했다. 기존 54개 테스트는 신규 개발 전 PASS였다.

3. Review Sheet: `buildReviewSheet`와 CLI `--review`를 추가했다. 출력은 `data/reviews/YYYY-MM-DD/<reportId>-review.md/json`이며 reportId, tradingDate, generatedAt, approvalStatus, BLOCKED 여부, claim 상태별 count, review item, VERIFIED 요약을 포함한다.

4. Review Queue: 문제 중심 우선순위를 적용했다. CRITICAL conflict, HIGH conflict, UNVERIFIED, PARTIALLY_VERIFIED, low confidence, KOREA_IMPACT, VERIFIED 순으로 사람이 볼 항목을 정렬한다. Markdown 검수표는 정상 VERIFIED claim을 요약으로 둔다.

5. Manual Review Action: `ReviewActionInput`과 `ReviewAction`을 추가했다. action은 `APPROVE|MODIFY|REJECT|HOLD`, category는 `DATA_ERROR|SOURCE_ERROR|CAUSAL_INTERPRETATION|KOREA_IMPACT|WORDING|SEO|LINK|DUPLICATE|OTHER`를 지원한다. CLI `--apply-review-actions`는 JSON action 배열을 입력으로 받는다.

6. Approval Gate: 수동 action이 0건이면 `AUTO_VALIDATED`를 자동으로 `APPROVED`로 올리지 않는다. unresolved CRITICAL/HIGH conflict, 중요한 UNVERIFIED/INSUFFICIENT/REVIEW_REQUIRED claim, 미처리 reviewQueue, HOLD action은 `REVIEW_REQUIRED`를 유지한다. 자동 PUBLISHED 처리는 없다.

7. Human Override: unresolved claim을 APPROVE하려면 note/reviewer/reviewedAt/originalVerificationStatus/finalDecision을 기록한다. 원래 ConflictRecord는 삭제하지 않는다.

8. Publish-ready Draft: `buildPublishReadyDraft`를 추가했다. 9개 기본 목차를 유지하고, MODIFY action은 문장을 교체하며, REJECT action은 해당 문장을 제외한다. 내부 traceability는 sentence → claimIds → evidenceIds → sourceIds/sourceUrls를 보존한다.

9. Machine/Human Diff: `buildMachineHumanDiff`를 추가했다. reportId, originalText, finalText, changedClaims, addedText, removedText, editCategories, editCount를 저장한다.

10. Review Metrics: reviewStartedAt, reviewCompletedAt, reviewDurationSeconds, claimsReviewed, claimsApproved, claimsModified, claimsRejected, claimsHeld, conflictsResolved, manualEdits, reviewer, measurementStatus를 채운다. 실제 사람 검수가 없으면 `NOT_MEASURED`다.

11. Operational Review Day: Golden Day 2026-09-11을 운영 검수 리허설일로 사용했다. 생성 reportId는 `MANUAL-2026-09-11-7cb0ccf11f29`다. 실제 신규 거래일 데이터는 추가하지 않았다. 검증 가능한 후속 거래일 데이터 연결이 없으므로 임의 생성하지 않았다.

12. Claims / Conflicts: 2026-09-11 operational review day는 claim 15개, conflict 0개, approvalStatus `AUTO_VALIDATED`, publishAllowed `false`다. 수동 action 0건이므로 승인 상태로 올리지 않았다.

13. 테스트 수: 전체 61개 PASS. Sprint 2D 신규 테스트는 Review Sheet, Review Queue priority, APPROVE/MODIFY/REJECT/HOLD, invalid claimId, reportId mismatch, unresolved critical/high conflict block, human override audit, publish-ready draft, machine/human diff, review metrics, traceability를 포함한다.

14. Typecheck: `npm.cmd run typecheck` PASS.

15. Build: `npm.cmd run build` PASS.

16. Secret scan: source/config/docs/data tracked scope에서 credential pattern을 점검했다. 실제 secret은 발견하지 못했다.

17. PASS: 기존 regression, Review Sheet, Manual Review Action, Approval Gate, Human Override Audit, Publish-ready Draft, Machine/Human Diff, Review Metrics, claim/evidence/source traceability, typecheck, build, tests, sample, golden day regression.

18. FAIL: 없음.

19. 미검증: 실제 사람이 10~20분 안에 검수했는지 여부는 측정하지 않았다. `measurementStatus=NOT_MEASURED`다. 실제 Blogger/게시 플랫폼 발행도 연결하지 않았다. Golden Day 이후 완료된 신규 실제 거래일은 데이터 미연결로 추가하지 않았다.

20. 변경 파일: `src/domain/models.ts`, `src/services/review.ts`, `src/cli.ts`, `tests/pipeline.test.ts`, `README.md`, `docs/sprint-2d-report.md`, `data/reviews/2026-09-11/*`, `data/publish-ready/2026-09-11/*`.

21. 최종 commit: 작업 완료 후 생성한다.

22. Working tree 상태: commit 전에는 위 변경 및 Sprint 2C bundle untracked가 존재한다. bundle은 이전 산출물로 이번 commit에는 포함하지 않는다.

23. 다음 Sprint 제안: 실제 human reviewer가 review actions를 입력하는 운영 리허설을 수행하고, 10~20분 KPI를 실제 타임스탬프로 측정한다. 이후 검수 action이 반복적으로 수정한 category를 자동 원고 개선 rule로 반영한다.
