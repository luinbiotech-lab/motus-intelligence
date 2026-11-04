# MOTUS 데일리 리포트 운영 (2026-11-04 결정)

- 기사(Claude 디자인)는 그대로 두고, 리포트는 '리포트' 라벨의 별도 글로 낸다. PDF는 표지 1쪽과 분야별 루인 디자인 2쪽으로 구성된다.
- 요일 규칙(루치오 결정): 월요일은 국내+AI, 화~금요일은 국내·미국·AI, 주말은 리포트 없음. 다음 날 05:40 KST에 최종 시도한다(발행된 분야만, 빠진 분야는 글에 명시).
- 발행 판정은 각 분야의 publish ledger(PUBLISHED/REPUBLISHED)를 기준으로 한다. auto-publish.json은 이후 실행이 덮어쓰므로 기준으로 쓰지 않는다.

## 데이터 검증 단계 (루인 리뷰 P0/P1)
1. **사전 점검 (`--execute` 없음, 인증정보 없음)**
   - 파일만 보고 판단한다: ledger, published-unit.json, live-unit.json, 요일 규칙.
   - 이 단계의 결과 `SIMULATED`는 "파일상 준비됨"일 뿐이다. 실발행이 가능하다는 뜻도, 실데이터 검증을 통과했다는 뜻도 아니다.
2. **실행 (`--execute`)**
   - ledger의 postId로 Blogger 저장본을 다시 읽는다.
   - 후보(스냅샷 → live)마다 `storedContentValid`로 대조한다. 기사 발행 게이트와 같은 검사다.
   - 일치한 후보만 PDF에 차트·수치로 넣는다.
   - 불일치·식별 오류·읽기 실패가 난 분야는 링크로만 넣는다. 최종 시도 전이면 HOLD(`UNVERIFIED_DATA_FOR_*`)한다.
3. **발행 후 readback**
   - 다음 항목을 모두 확인한 뒤에만 ledger에 PUBLISHED를 기록한다: 상태, 퍼머링크, 제목, 날짜 표식(`data-daily-report`), PDF 링크.

## 실데이터 대조 사례 (회귀 테스트 tests/daily-report.test.ts 유지)
| 날짜·분야 | 대조 결과 |
|---|---|
| 11/4 AI | 일치 |
| 11/4 국내·미국 | 불일치. 발행 후 다른 실행이 새 디자인으로 live-unit을 다시 만들었다. |
| 10/30 미국 | 불일치. 다시 만든 유닛의 제목이 달랐다. |

## 첫 라이브 보고 항목 (루인 요청)
- post URL
- PDF Drive URL
- readback 결과
- PDF 쪽수(5쪽/7쪽)
- 누락·중복 여부
- 분야별 검증 결과(VERIFIED_SNAPSHOT / VERIFIED_LIVE / 링크만 넣은 경우 그 사유)
- 판정: PASS/FAIL

첫 운영 리허설에서 함께 확인할 것:
- 리포트 ledger의 PUBLISHED로 SKIP되는 경로
- Drive 업로드 후 장애가 났을 때 같은 이름 교체와 초안 재사용으로 복구되는지
