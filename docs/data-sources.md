# 출처 Registry 운영

SEC EDGAR, BLS, BEA, FRED, U.S. Treasury, Federal Reserve, Corporate IR, KRX, OpenDART, ECOS, 향후 국내 증권사 Open API와 Sprint 2A 실제 리허설용 NYSE, S&P Dow Jones Indices, Nasdaq, FTSE Russell/LSEG, Cboe, ICE 분류를 등록했다. Corporate IR는 개별 기업별 등록으로 확장해야 하는 분류이며 homepage는 기업 공시 검색 참고 위치다. 국내 증권사는 미선정 placeholder다.

Sprint 2A 기준 자동 수집 연결은 `US_TREASURY`만 `enabled=true`, `connectionStatus=OK`다. `TreasuryYieldAdapter`는 U.S. Treasury 일별 CSV에서 지정 거래일과 직전 거래일의 2Y/10Y par yield를 읽어 `MarketSnapshot` 두 건으로 정규화한다. 429는 `REVIEW_REQUIRED`, 503 등 공급자 오류와 timeout은 `SOURCE_UNAVAILABLE`, 빈 응답과 누락 거래일은 `NO_DATA`, malformed/invalid numeric은 `REVIEW_REQUIRED`, freshness 초과는 `DELAYED`로 반환한다. 실패 시 대체값을 만들지 않는다.

그 외 자동 수집 연결은 `enabled=false`, `connectionStatus=DATA_NOT_CONNECTED`다. 실제 인증, API 호출, 시세 이용 계약을 확인하거나 연결하지 않았다. Registry의 인증 방식은 연결 설계용 초기 값이며 연결 전 공식 문서로 재검증해야 한다. sourceUrl은 실제 입력자가 해당 자료의 직접 원문 링크를 넣는다. URL 형식만 자동 검증하며 도메인 소유·본문 진위·접근 가능성은 자동 검증하지 않는다.

약관을 검토하지 않았으므로 모든 출처의 redistributionStatus/commercialUseStatus는 UNKNOWN이다. rateLimit과 latency도 UNKNOWN으로 남겼다. maxAgeMinutes=2160은 공급자의 지연 보증이 아닌 내부 최신성 검사 기본값(36시간)이다. 실제 운영에서는 자료 성격별로 조정해야 한다.

공식 출처 여부는 기관 분류이며 FRED의 개별 시계열 원출처 등 문서별 근거 품질을 보장하지 않는다. SAMPLE_A/B는 공식 출처 조건을 모사하는 **가상 테스트 분류**이며 실제 출처가 아니다. 실제 입력에서 SAMPLE 출처 사용은 차단한다.

어댑터는 DataAdapter의 collect(source, options)로 sourceId/status/records/message를 반환한다. 기본 UnconnectedAdapter는 빈 records와 DATA_NOT_CONNECTED만 반환한다. 미연결 상태에서 임의 수치를 생성하지 않는다.

2026-09-11 리허설의 ICE DXY/Brent 값은 ICE 상품 페이지를 제공자 원문으로 두고 보조 종가 자료로 수동 대조했다. ICE 페이지 자체의 표시 지연과 재배포 조건은 별도 검토가 필요하다. BLS CPI의 실제 발표값은 BLS 원문, consensus 값은 보조 시장 캘린더/기사 URL로 확인했다. 필드별 provenance는 다음 Sprint 과제다.
