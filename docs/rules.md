# 미국→한국 Rule v1.0.0

설정 파일에 13개 대표 규칙을 둔다. 모든 규칙은 조건부 가설이며 투자 추천 또는 수익률 예측이 아니다. 경험적 성능을 검증한 모델도 아니다. 자동 세부 종목 연결은 없고 koreaCompanyCandidate는 빈 배열이다.

| Rule | Trigger | 전달경로 | 한국 산업 | 기본 방향 / 강도 |
| --- | --- | --- | --- | --- |
| UK-01 | AI_CAPEX_UP | AI_CAPEX | Semiconductor | POSITIVE / 4 |
| UK-02 | CHIP_DEMAND_UP | SEMICONDUCTOR_CYCLE | Semiconductor | POSITIVE / 3 |
| UK-03 | EV_DEMAND_DOWN | DEMAND | Battery / EV | NEGATIVE / 3 |
| UK-04 | USD_UP | FX | Automobile | MIXED / 2 |
| UK-05 | OIL_UP | ENERGY | Energy | MIXED / 3 |
| UK-06 | DRUG_POLICY_TIGHTEN | REGULATION | Bio / Healthcare | NEGATIVE / 3 |
| UK-07 | RATES_UP | INTEREST_RATE | Internet / Platform | NEGATIVE / 3 |
| UK-08 | DEFENSE_BUDGET_UP | POLICY | Defense / Aerospace | POSITIVE / 3 |
| UK-09 | CONSUMPTION_DOWN | DEMAND | Consumer | NEGATIVE / 2 |
| UK-10 | LIQUIDITY_DOWN | LIQUIDITY | Finance | NEGATIVE / 3 |
| UK-11 | INPUT_COST_UP | COMMODITY | Consumer | NEGATIVE / 2 |
| UK-12 | SUPPLY_DISRUPTION | SUPPLY_CHAIN | Semiconductor | MIXED / 3 |
| UK-13 | RISK_OFF | RISK_SENTIMENT | Finance | NEGATIVE / 2 |

Trigger와 미국 산업이 정확히 일치해야 한다. usCompany/macroCondition이 설정된 규칙은 해당 조건도 충족해야 한다. 초기 설정은 대표 산업을 다루므로 기업 제한 및 거시 조건 배열은 비워두었다. 원인 신호는 수동 검수 입력이다. 기사 텍스트로 자동 causal driver를 생성하지 않는다.

## 근거와 점수

제외되지 않은 eventId/evidenceIds를 연결하고 중복 sourceId를 한 번만 센다. 같은 출처의 여러 문서는 신뢰도 가점을 반복해서 받지 않는다.

- 공식 출처 2개 이상: A / 기본 신뢰도 90
- 공식 출처 1개: B / 기본 신뢰도 75
- 비공식 근거만: C / 기본값 40. 현재 검증 정책에서는 비공식 레코드를 분석에서 제외하므로 운영상 단독 근거로 사용할 수 없다.
- 필수 근거 부족 또는 참조 누락: UNVERIFIED
- 신뢰도 = clamp(기본값 − 실제 입력 반대변수 수 × 10 − 참조 누락 시 30, 0, 100)
- 강도 = clamp(규칙 기본 강도 + A일 때 1 − min(2, 실제 입력 반대변수 수), 1, 5)
- 필수 근거 미충족 또는 신뢰도 <60이면 LOW_CONFIDENCE, 방향 HOLD, 강도 1

규칙의 counterFactors는 검수용 가능 변수 목록이므로 모두 실제 발생한 것으로 간주해 감점하지 않는다. signals.counterFactors와 koreaContext.counterFactors에 입력한 실제 반대변수만 중복 제거 후 감점한다. 근거 A/B 분류는 source registry의 official 분류에 따른 기계적 규칙이며 문서 독립성·원문 진위 검증을 대신하지 않는다.

모든 후보는 scoreCalculation, evidenceIds, ruleId/ruleVersion, validityHorizon을 남긴다. 버전 변경 시 기존 출력과 별도 비교한다. 사후 검증은 실제 국내 결과·설명력·반대변수·규칙 개선 필요 중심이다.
