# 수동 입력 운영

1. `data/fixtures/sample-day.json`으로 파이프라인 동작을 먼저 확인한다. 숫자는 산술 테스트용 100→110 등이며 실제 과거 시장값이 아니다. 날짜 2000-01-03 역시 고정 테스트 축이다.
2. 실제 입력은 날짜별 `data/manual/YYYY-MM-DD/input.json`에 둔다. fixture 파일을 실제 자료처럼 재사용하지 않는다. sample은 envelope와 모든 레코드에서 false로 설정한다.
3. 실제 원문에서 확인한 값·단위·시각·직접 링크를 기재한다. 실제 레코드는 `collectionMode=MANUAL_VERIFIED` 또는 공식 어댑터 산출물의 `API`만 허용하며, `MANUAL_VERIFIED`는 `verificationUrls`를 1개 이상 요구한다. SAMPLE 출처·가상 종목·예시 URL을 실제 입력에 사용하지 않는다. 미연결 API에서 값을 만들어 넣지 않는다.
4. 미국 동부 기준 tradingDate와 실제 closeAt을 수동 확인한다. ISO 시각에는 Z 또는 UTC 오프셋을 넣는다. asOf는 분석 기준시각이다. generatedAt은 CLI 실행시각으로 별도 저장된다.
5. sourceId는 Registry에 존재해야 한다. API 미연결(enabled=false)은 자동 수집 불가라는 의미이며, 해당 공식 원문을 사람이 확인해 수동 입력하는 것은 가능하다.
6. 누락 수치는 null, missingReasons에 사유, 해당 데이터 상태를 기재한다. 값이 없는데 0을 대신 넣지 않는다. 실제 0과 미입력은 다르다.
7. signals에는 eventId와 근거 evidenceIds를 연결하고 Rule의 trigger/usIndustry를 정확히 사용한다. 기업 신호는 CompanyEvent의 eventType/companyId와 일치해야 한다. 거시 신호의 의미 확인은 사람이 맡는다.
8. 결과의 검수 우선 목록, 출처 원문, 반대변수, 실제 거래일·조기 마감, 샘플 혼입을 확인한다. Blogger 복사·발행은 사용자가 수행한다.

## 입력 묶음

`schemaVersion`, `sample`, `tradingDate`, `asOf`, `session`, `market`, `macro`, `companyEvents`, `filings`, `news`, `signals`, `koreaContext`가 모두 필수다. 내용이 없으면 배열을 비우되 해당 영역은 NO_DATA로 표시된다. API 어댑터는 DATA_NOT_CONNECTED를 반환한다. 분리된 sample-*.json 파일은 문서용 예시이며 CLI 입력은 통합 sample-day.json 형식이다.

session은 `status=OK|HOLIDAY|EARLY_CLOSE`, closeAt, sourceId, sourceUrl을 요구한다. 거래일 달력은 자동 검증하지 않는다. 조기 마감일에는 그날의 closeAt을 입력한다. 시장 observedAt은 같은 미국 동부 기준 거래일이어야 하며 관측≤수집≤asOf 조건을 만족해야 한다. 종가 지수, VIX, Treasury 15:30 ET 금리, ICE 선물처럼 상품별 공식 기준시각이 다를 수 있으므로 모든 시장 레코드를 closeAt 1분 이내로 강제하지 않는다.

시장 단위는 INDEX=points, EQUITY=price, FX=rate, YIELD=percent, COMMODITY=price다. 지원 통화는 USD, KRW, JPY, EUR, GBP, CHF, CAD, AUD다. 상품별 음수 가격 가능성이 있으므로 모든 가격에 일괄 양수 제약을 두지는 않는다. volume은 0 이상이다.

change는 원본 close-previousClose와 허용 오차 1e-8 이내, changePct는 소수점 2자리 반올림 결과와 허용 오차 1e-8 이내여야 한다. previousClose=0 또는 계산 오버플로는 INVALID_VALUE다. 반올림은 절대값 기준 절반 올림 후 부호를 복원한다. IEEE-754 숫자를 사용하므로 회계 수준 임의 정밀도 계산은 지원하지 않는다.

거시 unit은 원문 단위를 유지하고 adjustmentType은 SA/NSA/UNKNOWN을 명시한다. 컨센서스 출처가 별도일 때는 `verificationUrls`에 보조 확인 URL을 추가하고 검수에서 구분한다. 필드별 출처 모델은 다음 Sprint 과제다.

일정(calendar)은 아직 수동 문자열이며 원고에 EXPECTATION 및 검수 필요로 표시한다. 자동 경제 캘린더는 미연결이다. 기사의 전문·본문·HTML은 저장하지 않으며 제목/짧은 사실/출처/링크만 입력한다.

## 10~20분 검수 흐름의 기반

- 오류·누락·충돌 목록 확인 및 입력 정정
- 종가·등락률·기준일/시각과 거시 지표 원문 대조
- 한국 영향의 전달경로·근거·반대변수 검토
- 일정·문장·출처 표기 확인 후 사용자가 복사하여 발행

Sprint 2A의 2026-09-11 리허설은 자동 생성까지 검증했지만 사람이 실제 발행 검수를 시작·종료하지 않았으므로 evidence의 `reviewMetrics.measurementStatus`는 `NOT_MEASURED`다. 10~20분 달성을 검증했다고 주장하지 않는다.
