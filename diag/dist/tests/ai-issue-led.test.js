import test from 'node:test';
import assert from 'node:assert/strict';
import { composeAIDeepSections } from '../src/operations/market-deep-sections.js';
const report = (broker, title) => ({ kind: 'MARKET', date: '2026-10-30', title, broker, analysts: '', url: `https://stock.pstatic.net/stock-research/market/1/${encodeURIComponent(broker)}.pdf`, summary: [], targetPrice: null, rating: null, stockCode: null, company: null });
const bundle = { briefs: [
        { report: report('A증권', '10/30 A증권 모닝코멘트'), statements: [{ region: 'US', text: '알파벳이 실적 부진과 잉여현금흐름 악화에 12%대 급락하며 시장 전반 약세. AI의 검색산업 잠식 우려 확대', heading: null }, { region: 'US', text: '한편, 9월 PCE 물가지수는 시장 예상치에 부합', heading: null }], digests: [] },
        { report: report('B증권', '[Market Time] 빅테크 실적 쇼크'), statements: [{ region: 'US', text: '미국 빅테크는 AI 매출 성장에도 대규모 투자에 따른 현금흐름 악화가 부담으로 작용했습니다.', heading: null }, { region: 'KOREA', text: '코스피는 삼성전자 실망 매물에 하락 마감', heading: null }], digests: [] },
    ], company: [], industry: [], economy: [], audit: [] };
const stock = (symbol, koreanName, changePct) => ({ symbol, name: symbol, koreanName, changePct, close: 100, date: '2026-10-29', trendingRank: null, mostActiveRank: null, marketCap: null });
test('the AI article leads with the day\'s AI issue as brokers explained it', () => {
    const composed = composeAIDeepSections({ bundle, stocks: [stock('GOOGL', '알파벳', -12.64), stock('MSFT', '마이크로소프트', -0.2), stock('NVDA', '엔비디아', -1.5)], sessionDate: '2026-10-29' });
    assert.equal(composed.hasCoreCommentary, true);
    const issue = composed.sections[0];
    assert.equal(issue.key, 'ai-issue');
    assert.equal(issue.placement, 'early');
    const text = issue.paragraphs.map(p => p.text).join('\n');
    assert.match(text, /A증권은 10월 30일 아침 리포트 「10\/30 A증권 모닝코멘트」에서 “알파벳이 실적 부진과 잉여현금흐름 악화에 12%대 급락/);
    assert.match(text, /B증권은 .*“미국 빅테크는 AI 매출 성장에도/);
    assert.doesNotMatch(text, /PCE|코스피/, 'only AI-related U.S. commentary');
    assert.equal(composed.titleFocus, '알파벳 13% 급락');
    assert.deepEqual(composed.leadAddition, ['직전 미국 정규장(10월 29일)에서 알파벳(GOOGL)은 12.64% 급락했다.']);
    const stocks = composed.sections.find(item => item.key === 'ai-stocks');
    assert.equal(stocks.placement, 'early');
    assert.match(stocks.paragraphs[0].text, /가장 약한 종목은 알파벳\(GOOGL, -12\.64%\)이었다\./);
});
test('no AI commentary, no issue section and no market headline', () => {
    const composed = composeAIDeepSections({ bundle: { ...bundle, briefs: [] }, stocks: [stock('GOOGL', '알파벳', -12.64), stock('MSFT', '마이크로소프트', -0.2), stock('NVDA', '엔비디아', -1.5)], sessionDate: '2026-10-29' });
    assert.equal(composed.hasCoreCommentary, false);
    assert.equal(composed.titleFocus, null);
    assert.ok(!composed.sections.some(item => item.key === 'ai-issue'));
});
test('the AI headline needs the printed stock section and a quoted mention', () => {
    const two = composeAIDeepSections({ bundle, stocks: [stock('GOOGL', '알파벳', -12.64), stock('MSFT', '마이크로소프트', -0.2)], sessionDate: '2026-10-29' });
    assert.equal(two.titleFocus, null, 'fewer than three stocks print no stock section, so no headline number');
    const meta = { ...bundle, briefs: [{ report: bundle.briefs[0].report, statements: [{ region: 'US', text: '메타버스 관련 투자 기대에 AI 반도체가 강세를 보이며 상승 마감', heading: null }], digests: [] }] };
    const composed = composeAIDeepSections({ bundle: meta, stocks: [stock('META', '메타', 5.1), stock('MSFT', '마이크로소프트', -0.2), stock('NVDA', '엔비디아', -1.5)], sessionDate: '2026-10-29' });
    assert.equal(composed.titleFocus, null, '메타버스 is not Meta');
});
test('an issue-led AI article reports official announcements as facts, without template readings', async () => {
    const { renderAIEditorialArticle } = await import('../src/publishers/editorial-article.js');
    const issue = { headline: '엔비디아, AI 교육 공개', whatHappened: ['엔비디아는 10월 30일 공식 블로그에 교육 프로그램 발표를 게시했다.'], coreContent: '', whyItMatters: 'MOTUS 분석: AI 교육 프로그램은 당장의 매출보다 장기 투자에 가깝다.', relatedCompaniesIndustries: ['엔비디아'], marketConnection: '시장 평가는 발표 이후 고객 채택, 매출 기여와 인프라 투자 자료가 확인된 뒤 판단해야 한다.', institutionView: null, evidenceRefs: ['https://blogs.nvidia.com/x'] };
    const base = { publicationId: 'p', issueDate: '2026-10-30', issueNumber: 1, title: '알파벳 13% 급락…증권가가 짚은 AI 투자 쟁점', subtitle: 's', category: 'AI_INTELLIGENCE', canonicalLabel: 'AI Intelligence', displayLabel: 'AI 인텔리전스', todayCore: { headline: 'h', summary: '직전 미국 정규장(10월 29일)에서 알파벳(GOOGL)은 12.64% 급락했다.', bullets: [] }, issues: [issue], industryFlow: [], industryConnections: [{ title: 't', explanation: 'MOTUS 분석: 신규 기능 공개의 의미는 과금 구조에 달려 있다.', connectedCompanies: [], connectedIndustries: [], evidenceRefs: [], optionalWatchPoint: '' }], whatToWatch: [{ headline: '엔비디아 교육', watchFor: '교육 대상과 규모가 공개되는지 확인할 필요가 있다.', validityHorizon: 'NEXT_30_DAYS' }], sources: [{ label: '엔비디아 공식 발표', url: 'https://blogs.nvidia.com/x', publisher: 'NVIDIA' }] };
    const led = renderAIEditorialArticle({ ...base, deepSections: [{ key: 'ai-issue', placement: 'early', title: '오늘의 AI 쟁점: 증권가 시각', paragraphs: [{ text: 'A증권은 “알파벳 급락”이라고 진단했다.' }] }] }).html;
    assert.match(led, /엔비디아는 10월 30일 공식 블로그에/);
    assert.doesNotMatch(led, /MOTUS 분석:|판단해야 한다|확인할 필요가 있다|과금 구조/);
    assert.ok(led.indexOf('오늘의 AI 쟁점') < led.indexOf('엔비디아, AI 교육 공개'), 'the market issue comes before announcements');
    const plain = renderAIEditorialArticle(base).html;
    assert.match(plain, /MOTUS 분석:/, 'without a market issue the official-announcement article keeps its reading');
});
