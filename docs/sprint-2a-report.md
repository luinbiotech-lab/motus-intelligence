# Sprint 2A 완료 보고

검증 시각: 2026-09-13T08:30:11Z  
실제 리허설 거래일: 2026-09-11  
리포트 ID: MANUAL-2026-09-11-94b605cfd86f

## 1. 저장소 상태

작업 디렉터리는 `master` 브랜치이며 아직 커밋이 없는 unborn HEAD 상태다. 기존 프로젝트 파일은 모두 untracked 상태라 커밋은 만들지 않았다. Sprint 2A 변경은 코드, config, 실제 수동 입력, 문서, 테스트에 반영했다.

## 2. 기존 회귀

`npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run sample`이 통과했다. 테스트는 30개에서 41개로 늘었고 41개 모두 PASS다.

## 3. 실제 거래일 선택

2026-09-13 Asia/Seoul 기준 가장 최근 완료 미국 정규장으로 2026-09-11 금요일을 선택했다. NYSE 달력에서 2026년 Labor Day 휴장은 2026-09-07이고, 2026-09-11은 조기종료일로 표시되지 않았다. 출처: https://www.nyse.com/trade/hours-calendars

## 4. 실제 데이터 분리

실제 입력은 `data/manual/2026-09-11/input.json`에 별도 보관했다. 샘플 fixture와 실제 입력은 파일 경로와 `sample` 플래그로 분리한다.

## 5. 실제 미국시장 데이터

입력에는 SPX, DJIA, Nasdaq Composite, Russell 2000, VIX, U.S. Treasury 2Y/10Y, DXY futures, Brent futures가 포함됐다. 지수 종가는 S&P Dow Jones Indices, Nasdaq, FTSE Russell/LSEG, Cboe, ICE 제공자 페이지와 보조 종가 자료로 검증했다. Treasury 값은 공식 CSV에서 2026-09-11 2Y 4.63%, 10Y 4.96%를 확인했다. 출처: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/202609?type=daily_treasury_yield_curve&field_tdr_date_value_month=202609

## 6. 공시, 거시, 이벤트

BLS CPI 발표는 2026-09-11 08:30 ET 자료를 사용했고, headline CPI 전월 대비 0.4%, 전년 대비 3.4%를 입력했다. 컨센서스 값은 보조 기사 URL로 별도 확인했다. 출처: https://www.bls.gov/news.release/archives/cpi_09112026.htm 및 https://www.kiplinger.com/investing/economy/cpi-report-august-2026-what-to-expect

Oracle 이벤트는 Oracle IR 발표와 SEC 8-K를 사용했다. 총매출 193억 달러, 클라우드 매출 116억 달러, IaaS 매출 74억 달러, 850MW 추가 데이터센터 용량을 수동 사실로 기록했다. 출처: https://investor.oracle.com/investor-news/news-details/2026/Oracle-Announces-Q1-Results-Driven-by-Triple-Digit-Growth-in-Cloud-Infrastructure-Revenues/default.aspx 및 https://www.sec.gov/Archives/edgar/data/1341439/000119312526387905/0001193125-26-387905-index.htm

## 7. 출처 추적성

실제 레코드는 모두 `collectionMode=MANUAL_VERIFIED`와 `verificationUrls`를 가진다. Evidence package는 reportId, 원본 입력 SHA-256, records, usedInSections, validationResult, stages, reviewMetrics를 보존한다. 뉴스 전문과 HTML 본문은 저장하지 않았다.

## 8. 실제 파이프라인

`npm.cmd run report -- --input data/manual/2026-09-11/input.json` 결과는 PASS다. 생성 파일은 `data/reports/MANUAL-2026-09-11-94b605cfd86f.md`, `data/reports/MANUAL-2026-09-11-94b605cfd86f.json`, `data/evidence/MANUAL-2026-09-11-94b605cfd86f.json`이다.

## 9. 9개 섹션 품질

블로그 초안은 SEO 제목, 3줄 요약, 미국시장 마감, 시장 원인, 주요 기업과 산업, 한국시장 영향, 일정과 체크리스트, 출처, 해시태그의 9개 섹션을 유지한다. 시장 숫자 표시는 부동소수점 raw 흔적이 보이지 않도록 정리했다.

## 10. 한국시장 영향 후보

후보는 2건이다. 금리 상승 경로는 Internet/Platform에 NEGATIVE, Oracle AI capex 경로는 Semiconductor에 POSITIVE로 생성됐다. 둘 다 INFERENCE이며 수익률 예측이 아니다. 각 후보에는 evidenceIds, counterFactors, ruleId, confidenceScore가 연결된다.

## 11. 검수 시간 구조

Evidence package에 reviewMetrics를 추가했다. 자동 생성 시각은 기록되지만 인간 검수 시작/완료 시각이 없으므로 `measurementStatus=NOT_MEASURED`다. 10~20분 검수 달성은 아직 주장하지 않는다.

## 12. 근거 일치성

테스트에서 원고 item의 evidenceIds가 evidence records에 존재하는지, evidence record의 usedInSections가 역추적되는지, reportId가 원고와 evidence package에서 같은지 검증한다.

## 13. 첫 공식 어댑터

첫 공식 어댑터는 `TreasuryYieldAdapter`로 선택했다. 인증키 없이 공식 CSV 접근이 가능하고, 일별 2Y/10Y 금리를 시장 cross-asset 입력에 바로 쓸 수 있기 때문이다.

## 14. 어댑터 장애 상태

어댑터 테스트는 성공, timeout, rate limit, provider unavailable, empty, missing date, malformed header, invalid numeric, delayed를 포함한다. 실패 시 임의 값을 만들지 않는다.

## 15. 실제 어댑터 실호출

실호출에서 2026-09-11 US2Y 4.63, US10Y 4.96 레코드 2건을 `collectionMode=API`로 정규화했다. 상태는 OK였다.

## 16. 추가 테스트

실제 fixture load, sample/real reject, manual verified 필수성, verification URL 필수성, official adapter success/failure, evidence traceability, report/evidence 동일 ID, unsupported rule review를 추가했다.

## 17. 전체 검증 결과

최종 검증은 typecheck PASS, 41/41 tests PASS, sample PASS, real E2E PASS, Treasury live adapter PASS다. 운영 리포트의 publishStatus는 여전히 BLOCKED이며 자동 발행은 없다.

## 18. 남은 범위

시장 데이터 재배포/상업 이용 조건, 필드별 provenance, 자동 거래일 캘린더 검증, SEC/BLS/FRED 추가 어댑터, Blogger 게시 연동, 실제 인간 검수 시간 측정은 다음 Sprint 범위다.
