# 발견 문제와 회귀 방지

| 문제 | 원인 | 해결 / 회귀 방지 |
| --- | --- | --- |
| npm init 실패 | 한글 디렉터리 이름이 npm package name으로 부적합 | ASCII package name을 명시한 package.json 작성 |
| 개발 의존성 첫 설치 실패 | 기본 환경이 오프라인 캐시 전용이며 패키지 미보유 | 프로젝트 로컬 캐시로 승인된 설치 수행, package-lock.json 보존 |
| 첫 typecheck 실패 | Node 타입 포함 설정 누락 및 union 배열의 flatMap 추론 | tsconfig.types=node, flatMap<Provenance> 명시; typecheck 재실행 통과 |
| 테스트 러너 spawn EPERM | 제한 환경에서 파일별 자식 프로세스 생성 불가 | Node 24의 --test-isolation=none으로 동일 프로세스 실행; 테스트 격리는 structuredClone으로 유지 |
| Markdown 문자열 테스트 실패 | 안전한 Markdown 이스케이프를 고려하지 않은 기대 문자열 | 실제 구조화 원고 내용으로 검증하고 Markdown 생성은 별도 확인 |
| 뉴스 전문이 오류 근거에 남을 가능성 | 거부한 레코드도 원본 그대로 저장하는 초기 설계 | 미등록 뉴스 필드 제거, redactedFields 기록, 전문이 어떤 출력에도 없음을 회귀 테스트 |
| 중복 신호의 첫 후보가 남을 가능성 | 순차 중복 판별 방식 | 사전 ID 개수 집계 후 같은 ID 전부 제외하는 회귀 테스트 |
| 유한 입력으로 계산 오버플로 가능 | IEEE-754 범위를 초과한 뺄셈·나눗셈 | 계산 결과 유한성 검사, 오버플로 회귀 테스트 |
| 레코드 차단 상태가 최상위 검수 상태로 낮아질 가능성 | 최상위 BLOCKED 판정이 입력 envelope와 session에만 한정됨 | 모든 BLOCKED 검증 이슈를 실행 전체 BLOCKED로 승격하고 회귀 테스트 |
| 실제 거시 신호의 `usCompany` 빈 문자열 거부 | Signal 스키마는 빈 문자열을 허용하지 않음 | 거시 신호에는 `US_MACRO` 같은 명시적 식별자를 사용하고 실제 fixture 회귀 테스트 추가 |
| 실제 지수·금리의 기준시각이 closeAt과 다름 | Treasury 15:30 ET, VIX/선물 기준시각 등 상품별 관측시각 차이 | 같은 거래일·관측≤수집≤asOf를 검증하고, 모든 시장자료를 closeAt 1분 이내로 강제하지 않도록 조정 |
| 실제 리포트에 부동소수점 계산 흔적 노출 | `close-previousClose` raw 값을 그대로 문장에 사용 | 원고 표시는 소수 자릿수 제한 함수로 정규화하고 회귀 테스트로 긴 float 문자열 부재 확인 |
| 컨센서스와 공식 발표값의 출처 혼합 | BLS 원문은 실제 CPI 발표값을 제공하지만 consensus는 시장 예상 출처가 따로 필요 | `verificationUrls`에 보조 consensus 출처를 추가하고 문서에 필드별 provenance 확장 필요 기록 |
| 공식 API 어댑터 장애상태 미검증 | Sprint 1은 미연결 어댑터만 보유 | Treasury CSV 어댑터를 추가하고 성공, timeout, rate limit, provider unavailable, empty, missing date, malformed, invalid numeric, delayed 테스트 추가 |
| BLS consensus를 공식 API가 제공하지 않음 | BLS Public Data API는 시장 기대값이 아니라 공식 시계열을 제공 | BLS Adapter는 consensus를 생성하지 않고 null로 남김. missingReasons.consensus는 운영 PASS를 막지 않음 |
| BLS 공식 index 재계산값과 수동 rounded previous 차이 | API index에서 계산한 July m/m은 0.07, 수동 입력은 발표문 rounded 값 0.1 | golden comparison에 `CPI-MOM previous` 차이 -0.03을 `REVIEW_REQUIRED`로 기록 |
| SEC submissions metadata의 시각 정밀도 제한 | submissions endpoint는 filingDate/reportDate 중심이며 accepted timestamp를 직접 제공하지 않음 | golden comparison에 `SEC filedAt` 수동 accepted time과 API normalized date 차이를 `REVIEW_REQUIRED`로 기록 |
| API 레코드 ID가 signal evidenceIds와 달라질 수 있음 | 어댑터 기본 ID와 기존 수동 fixture ID가 다르면 분석 근거 연결이 끊김 | `recordId`/`recordIds` 옵션을 추가해 golden day에서 기존 evidence ID를 보존 |

테스트되지 않은 API 연결, 실제 원문 진위, 거래 캘린더 정확성, 약관 및 10~20분 운영 시간은 PASS로 표시하지 않는다. Sprint 2B에서는 U.S. Treasury, BLS CPI, SEC submissions 어댑터를 mock 및 실호출로 PASS 확인했다.
