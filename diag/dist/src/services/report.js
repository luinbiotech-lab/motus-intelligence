import { marketChange } from '../utils/calculations.js';
import { claimAllowedInReport } from './cross-verification.js';
const displayNumber = (value, decimals = 3) => Number(value.toFixed(decimals)).toString();
const displayChange = (value, unit) => displayNumber(value, unit === 'percent' ? 2 : 3);
export function generateReport(input, validation, candidates, reportId, generatedAt, claims = []) {
    const titles = ['SEO 제목 + 기준일', '3줄 요약', '미국시장 마감', '시장을 움직인 원인', '주요 기업과 산업', '한국시장 영향', '오늘의 일정과 체크리스트', '출처 및 관련 기사', '해시태그'];
    const sections = titles.map((title, i) => ({ id: `section-${i + 1}`, title, items: [] }));
    const claimIdsFor = (evidenceIds) => claims.filter(claim => claim.evidenceIds.some(id => evidenceIds.includes(id))).map(claim => claim.claimId);
    const blockedByClaim = (evidenceIds) => {
        const related = claims.filter(claim => claim.evidenceIds.some(id => evidenceIds.includes(id)));
        return related.some(claim => !claimAllowedInReport(claim));
    };
    const add = (index, text, nature = 'CONFIRMED_FACT', evidenceIds = []) => {
        if (evidenceIds.length && blockedByClaim(evidenceIds))
            return;
        const claimIds = claimIdsFor(evidenceIds);
        sections[index].items.push({ text, nature, evidenceIds, ...(claimIds.length ? { claimIds } : {}) });
    };
    const good = (id) => !validation.excludedIds.includes(id);
    const markets = input.market.filter(r => good(r.id));
    const marketSummary = (symbol) => {
        const record = markets.find(m => m.symbol === symbol && m.close !== null && m.previousClose !== null);
        if (!record || record.close === null || record.previousClose === null)
            return null;
        const c = marketChange(record.close, record.previousClose);
        return c.status === 'OK' ? `${record.symbol} ${displayNumber(record.close)} (${c.display.changePct.toFixed(2)}%)` : null;
    };
    const directionLine = [marketSummary('SPX'), marketSummary('IXIC'), marketSummary('VIX')].filter((item) => item !== null).join(', ');
    const seoTitle = `${input.sample ? '[SAMPLE · 발행 금지] ' : ''}${input.tradingDate} 미국시장 마감과 한국시장 전달경로`;
    const threeLineSummary = [`미국 기준 거래일 ${input.tradingDate}; 거래일 상태 ${input.session.status}.`, directionLine ? `주요 마감 흐름: ${directionLine}. 검증 통과 마감 자료 ${markets.length}건.` : `검증 통과 마감 자료 ${markets.length}건, 조건부 한국 영향 ${candidates.length}건.`, `조건부 한국 영향 ${candidates.length}건, 검수 항목 ${validation.issues.length}건. 모든 영향 판단은 추론이며 발행 전 출처 확인이 필요합니다.`];
    add(0, seoTitle);
    threeLineSummary.forEach(t => add(1, t));
    for (const m of markets) {
        if (m.close === null || m.previousClose === null)
            continue;
        const c = marketChange(m.close, m.previousClose);
        if (c.status === 'OK')
            add(2, `${m.symbol}: ${displayNumber(m.close)} ${m.unit} (${m.currency}), 전일 대비 ${displayChange(c.raw.change, m.unit)}, ${c.display.changePct.toFixed(2)}%. 기준시각 ${m.observedAt}.`, 'CALCULATED', [m.id]);
    }
    for (const m of input.macro.filter(r => good(r.id)))
        add(3, `${m.indicatorName} (${m.period}, ${m.adjustmentType}): 실제 ${m.actual ?? 'NO_DATA'}, 예상 ${m.consensus ?? 'NO_DATA'}, 이전 ${m.previous ?? 'NO_DATA'}, 수정 이전 ${m.revisedPrevious ?? 'NO_DATA'} ${m.unit}. 시장 반응의 원인 여부는 추가 검수 필요.`, 'CONFIRMED_FACT', [m.id]);
    for (const s of input.signals.filter(s => s.driverStatement))
        add(3, `${s.driverStatement} (수동 근거 연결 신호 ${s.trigger})`, 'INFERENCE', [s.eventId, ...s.evidenceIds]);
    for (const e of input.companyEvents.filter(r => good(r.id)))
        add(4, `${e.ticker} · ${e.title}: ${e.summary}`, 'CONFIRMED_FACT', [e.id]);
    for (const f of input.filings.filter(r => good(r.id)))
        add(4, `${f.ticker} ${f.formType}: ${f.extractedFacts.join('; ')}`, 'CONFIRMED_FACT', [f.id]);
    for (const c of candidates)
        add(5, `${c.koreaSector}: ${c.impactDirection}, 강도 ${c.impactStrength}/5, 근거 ${c.evidenceLevel}, 신뢰도 ${c.confidenceScore}/100 (${c.status}). ${c.rationale} 반대변수: ${c.counterFactors.join('; ')}. 유효기간 ${c.validityHorizon}. 규칙 ${c.ruleId}@${c.ruleVersion}.`, 'INFERENCE', c.evidenceIds);
    input.koreaContext.calendar.forEach(t => add(6, `수동 입력 일정(출처·시각 검수 필요): ${t}`, 'EXPECTATION'));
    add(6, '수치·기준시각·원문·반대변수 확인, 샘플 혼입 확인, 수동 발행 검수 완료 여부 확인.', 'OPINION');
    for (const group of [input.market, input.macro, input.companyEvents, input.filings])
        for (const r of group.filter(r => good(r.id)))
            add(7, `${r.sourceId} — ${r.sourceUrl} (관측 ${r.observedAt}, 수집 ${r.collectedAt})`, 'CONFIRMED_FACT', [r.id]);
    for (const n of input.news.filter(r => good(r.id) && r.usedInReport))
        add(7, `${n.title} / ${n.publisher} / ${n.publishedAt} / ${n.url}. 검증된 사실: ${n.verifiedFacts.join('; ')}`, 'CONFIRMED_FACT', [n.id]);
    add(8, input.sample ? '#SAMPLE #테스트데이터 #발행금지' : '#미국증시 #시장마감 #한국시장');
    for (const section of sections)
        if (!section.items.length)
            section.items.push({ text: input.session.status === 'HOLIDAY' ? 'HOLIDAY — 휴장일, 해당 자료 없음.' : 'NO_DATA — 검증된 수동 입력이 없습니다. 자동 API는 DATA_NOT_CONNECTED 상태입니다.', nature: 'CONFIRMED_FACT', evidenceIds: [] });
    return { reportId, tradingDate: input.tradingDate, generatedAt, publishedAt: null, templateVersion: '1.0.0', analysisRuleVersion: '1.0.0', status: 'REVIEW_REQUIRED', sample: input.sample, sections, seoTitle, threeLineSummary };
}
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]#])/g, '\\$1');
export function markdown(report, validation) {
    return `> ${report.sample ? 'SAMPLE 테스트 전용 · 실제 시장 데이터 아님 · 발행 금지' : '수동 검수 대기 · 자동 발행 없음'}\n\n> reportId: ${report.reportId}\n\n검수 우선 목록\n\n${validation.issues.length ? validation.issues.map(i => `- [${i.status}] ${escape(i.recordId)} / ${escape(i.field)}: ${escape(i.message)}`).join('\n') : '- 검증 오류 없음. 원문 진위와 해석은 수동 검수 필요.'}\n\n` + report.sections.map(s => `## ${s.title}\n\n` + s.items.map(i => `- [${i.nature}] ${escape(i.text)}${i.evidenceIds.length ? ` (근거: ${i.evidenceIds.map(escape).join(', ')})` : ''}`).join('\n')).join('\n\n') + '\n';
}
