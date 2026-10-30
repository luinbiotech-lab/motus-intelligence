import { createHash } from 'node:crypto';
import { MOTUS_DISPLAY_NAME, MOTUS_PUBLIC_CATEGORY_MASTER, MOTUS_PUBLIC_CATEGORY_SLUGS } from '../content/publisher-schema.js';
import { motusMarketColors } from './daily-masters.js';
import { buildGoldenIntelligenceRehearsal } from './golden-rehearsal.js';
import { createFirstSplitDailyProductionRun } from './split-daily-production.js';
const body = 'font-family:Arial,&quot;Noto Sans KR&quot;,sans-serif;color:#172033;line-height:1.68;font-size:17px;width:100%;max-width:820px;box-sizing:border-box;margin:0 auto;overflow-x:hidden;overflow-wrap:anywhere';
const bar = 'background:#03162e;color:#fff;border:1px solid #010b17;padding:14px 16px;font-size:clamp(18px,4.8vw,21px);font-weight:800;margin:22px 0 0;width:100%;max-width:100%;box-sizing:border-box;word-break:keep-all;overflow-wrap:normal';
const box = 'border:1px solid #aebed2;padding:20px 21px;background:#fff;margin:0 0 20px;width:100%;max-width:100%;box-sizing:border-box';
export function createPeriodicProductionRun(generatedAt = '2026-10-01T12:00:00+09:00') {
    const daily = createFirstSplitDailyProductionRun(generatedAt);
    const golden = buildGoldenIntelligenceRehearsal().newsletter;
    const ai = daily.units.find(unit => unit.category === 'AI_INTELLIGENCE').viewModel;
    const us = daily.units.find(unit => unit.category === 'US_MARKET').viewModel;
    const korea = daily.units.find(unit => unit.category === 'KOREA_MARKET').viewModel;
    const sources = dedupeSources([...ai.sources, ...us.sources, ...korea.sources]);
    const map = { institutionalFocus: golden.investmentMapV1?.institutionalFocus.map(item => item.label) ?? [], crossMarketThemes: golden.investmentMapV1?.crossMarketThemes.map(item => item.label) ?? [], discussedCompanies: golden.investmentMapV1?.mostDiscussedStocks.map(item => item.label) ?? [], sectorAttention: [], targetPriceChanges: golden.investmentMapV1?.changes.filter(item => /목표주가/.test(item.detail)).map(item => item.detail) ?? [], ratingChanges: golden.investmentMapV1?.changes.filter(item => /투자의견/.test(item.detail)).map(item => item.detail) ?? [], riskMentions: golden.investmentMapV1?.majorRisks.map(item => item.label) ?? [] };
    const weekly = { metadata: metadata('WEEKLY_INTELLIGENCE', 'weekly-intelligence-2026-w40', '2026-09-28', '2026-10-02', ['2026-09-29', '2026-09-30'], generatedAt, ['주간 전체 발행일이 완료되지 않아 변화 추세 판정 보류']), executiveSummary: '확인 가능한 주간 구간에서는 AI가 장시간 실행·보안·과학 연구로 확장됐고, 미국 증시는 높은 장기금리 때문에 지수별 차별화가 나타났다. 국내 증시는 외국인·기관의 대형주 매도와 코스닥 일부 업종의 반등이 함께 관찰됐다.', weekAtAGlance: ['AI 경쟁의 초점이 모델 발표에서 실행 환경과 통제 계층으로 이동', '미국 10년물 5%대가 시장 폭과 경기민감주에 부담', '국내에서는 코스피 대형주 수급과 코스닥 반도체 장비 흐름이 엇갈림'], aiIntelligence: ai.issues.map(item => `${item.headline}: ${item.coreContent}`), usMarket: [us.marketSummary, ...us.marketCommentary], koreaMarket: [korea.marketSummary, ...korea.marketCommentary], ...(golden.crossIntelligenceChains?.length ? { crossIntelligence: golden.crossIntelligenceChains.map(item => item.connectionSummary) } : {}), ...(hasMap(map) ? { investmentMap: map } : {}), ...(map.riskMentions.length ? { riskSignals: map.riskMentions } : {}), weekReview: ['금리 부담과 AI 실행 인프라라는 두 축이 시장 해석의 중심이었다. 다만 현재 검증 범위는 주간 전체가 아니므로 관심도 증가·감소나 신규 부상 상태는 계산하지 않았다.'], nextWeekWatch: ['미국 10년물 5.3% 부근의 방향과 기술주 시장 폭', 'AI 에이전트의 장시간 실행 안정성과 보안 적용 사례', '코스피 외국인 매도 강도와 코스닥 기관 수급의 지속 여부'], sources };
    const event = { eventId: 'event:openai-dots-2026-09-29', eventDate: '2026-09-29', themeIds: ['theme:agentic-ai'], companyIds: ['company:openai'], initialEventSummary: 'OpenAI가 장시간 작업을 이어가는 에이전트 실행 환경 Dots를 공개했다.', wallStreetInterpretation: null, koreaInterpretation: '삼성증권 공개 리서치는 상시 실행형 에이전트의 기업 적용에서 작업 라우팅과 비용·칩 최적화를 확인 조건으로 제시했다.', initialMarketReaction: null, subsequentMarketReaction: null, evidenceRefs: ['EVIDENCE-REAL-OPENAI-DOTS-1', 'EVIDENCE-REAL-SAMSUNG-MORNING-1'], sourceRefs: ['https://openai.com/index/introducing-dots/', 'https://www.samsungpop.com/v2/today-invest/series/todaymarkettrend-3040'], verificationStatus: 'VERIFIED', confidence: null };
    const monthly = { metadata: metadata('MONTHLY_INTELLIGENCE', 'monthly-intelligence-2026-09', '2026-09-01', '2026-09-30', ['2026-09-29', '2026-09-30'], generatedAt, ['월간 전체 일별 history가 없어 반복 빈도와 기관 시각 변화 판정 보류']), executiveSummary: '9월 말 검증 구간에서는 AI 에이전트의 실행·보안·연구 적용이 구체화되는 한편, 장기금리와 유가가 주식시장 할인율을 높였다. 한국시장에서는 대형주 외국인 수급과 AI 인프라 관련 장기 연구 관점을 분리해 볼 필요가 있었다.', aiIndustryMonthly: ai.issues.map(item => item.headline), usMarketMonthly: [us.marketSummary], koreaMarketMonthly: [korea.marketSummary], crossMarketThemes: map.crossMarketThemes, ...(hasMap(map) ? { investmentMap: map } : {}), eventToMarketReview: [event], majorCompanies: ['OpenAI', 'NVIDIA', 'Microsoft'], majorSectors: ['AI 에이전트', 'AI 보안', '반도체·AI 인프라'], ...(map.riskMentions.length ? { majorRisks: map.riskMentions } : {}), monthReview: ['현재 확보한 월말 검증 자료만으로 월간 추세를 단정하지 않았다. Event-to-Market 항목은 사건과 국내 기관 해석까지만 연결하고 시장 반응 및 사후 성과는 null로 유지했다.'], nextMonthWatch: ['에이전트 제품의 기업 도입과 비용 구조', '장기금리·유가의 성장주 밸류에이션 영향', '한국 반도체 수급과 실제 설비투자 집행'], sources };
    const weeklyRender = renderWeeklyIntelligence(weekly);
    const monthlyRender = renderMonthlyIntelligence(monthly);
    const weeklyPdf = buildWeeklyPdfViewModel(weekly);
    const monthlyPdf = buildMonthlyPdfViewModel(monthly);
    const reportEntries = [...daily.units.map(unit => ({ title: unit.title, issueDate: unit.observedDate, periodStart: unit.observedDate, periodEnd: unit.observedDate, category: unit.category, reportType: unit.category === 'AI_INTELLIGENCE' ? 'AI_DAILY' : unit.category === 'US_MARKET' ? 'US_MARKET_DAILY' : 'KOREA_MARKET_DAILY', downloadUrl: null, articleUrl: null, generatedAt, publishedAt: null, state: 'PREVIEW_READY' })), { title: '주간 인텔리전스 구조 미리보기', issueDate: '2026-10-02', periodStart: weekly.metadata.periodStart, periodEnd: weekly.metadata.periodEnd, category: 'WEEKLY_INTELLIGENCE', reportType: 'WEEKLY_INTELLIGENCE', downloadUrl: null, articleUrl: null, generatedAt, publishedAt: null, state: 'PREVIEW_READY' }, { title: '월간 인텔리전스 구조 미리보기', issueDate: '2026-09-30', periodStart: monthly.metadata.periodStart, periodEnd: monthly.metadata.periodEnd, category: 'MONTHLY_INTELLIGENCE', reportType: 'MONTHLY_INTELLIGENCE', downloadUrl: null, articleUrl: null, generatedAt, publishedAt: null, state: 'PREVIEW_READY' }];
    const reports = buildReportArchiveView(reportEntries, {});
    const reportsHtml = renderReportArchive(reports);
    return { weekly, monthly, weeklyRender, monthlyRender, weeklyPdf, monthlyPdf, reports, reportsHtml, remoteCalls: { insert: 0, patch: 0, publish: 0, themeUpdate: 0, menuUpdate: 0 }, commerce: { enabled: false } };
}
export function detectPeriodChanges(current, prior) {
    if (!prior)
        return [];
    const currentMap = new Map(current.map(item => [item.key, item]));
    const priorMap = new Map(prior.map(item => [item.key, item]));
    const keys = [...new Set([...currentMap.keys(), ...priorMap.keys()])];
    return keys.map(key => { const now = currentMap.get(key), before = priorMap.get(key); const currentCount = now?.count ?? 0, priorCount = before?.count ?? 0; const state = !before ? 'NEW' : !now ? 'RESOLVED' : currentCount > priorCount ? 'INCREASED' : currentCount < priorCount ? 'DECREASED' : 'UNCHANGED'; return { key, label: now?.label ?? before.label, state, priorCount, currentCount, evidenceIds: unique([...(before?.evidenceIds ?? []), ...(now?.evidenceIds ?? [])]), sourceIds: unique([...(before?.sourceIds ?? []), ...(now?.sourceIds ?? [])]) }; });
}
export function deriveInstitutionSignals(observations) {
    const grouped = new Map();
    for (const item of observations) {
        const list = grouped.get(item.key) ?? [];
        list.push(item);
        grouped.set(item.key, list);
    }
    const consensus = [];
    const divergence = [];
    for (const [key, items] of grouped) {
        const institutions = unique(items.map(item => item.institution));
        if (institutions.length < 2)
            continue;
        const directions = unique(items.map(item => item.direction));
        const signal = (direction, selected) => ({ key, direction, summary: selected.map(item => `${item.institution}: ${item.summary}`).join(' / '), institutions: unique(selected.map(item => item.institution)), reportIds: unique(selected.map(item => item.reportId)), dates: unique(selected.map(item => item.publishedAt)), evidenceIds: unique(selected.flatMap(item => item.evidenceIds)), sourceIds: unique(selected.flatMap(item => item.sourceIds)) });
        for (const direction of directions) {
            const same = items.filter(item => item.direction === direction);
            if (new Set(same.map(item => item.institution)).size >= 2 && same.every(hasEvidence))
                consensus.push(signal(direction, same));
        }
        if (directions.length > 1 && items.every(hasEvidence))
            divergence.push(signal(directions.join(' vs '), items));
    }
    return { consensus, divergence };
}
export function renderWeeklyIntelligence(view) { return renderPeriod(view.metadata, '주간 핵심 요약 (Weekly Executive Summary)', view.executiveSummary, [['이번 주 한눈에', view.weekAtAGlance], ['AI·산업 주간 변화', view.aiIntelligence], ['미국증시 주간 분석', view.usMarket], ['국내증시 주간 분석', view.koreaMarket], ['교차 인텔리전스 (Cross Intelligence)', view.crossIntelligence], ['기관 공통 의견 (Consensus)', view.institutionalConsensus?.map(signal => signal.summary)], ['기관별 차이 (Divergence)', view.institutionalDivergence?.map(signal => signal.summary)], ['투자지도 (Investment Map)', mapLines(view.investmentMap)], ['이번 주 변화', [...(view.themeChanges ?? []), ...(view.companyChanges ?? [])].map(change => `${change.label}: ${change.state}`)], ['주요 리스크', view.riskSignals], ['주간 검토', view.weekReview], ['다음 주 체크포인트', view.nextWeekWatch]], view.sources); }
export function renderMonthlyIntelligence(view) { return renderPeriod(view.metadata, '월간 핵심 요약 (Monthly Executive Summary)', view.executiveSummary, [['AI·산업 월간', view.aiIndustryMonthly], ['미국증시 월간', view.usMarketMonthly], ['국내증시 월간', view.koreaMarketMonthly], ['기관 시각 변화', view.institutionViewChanges?.map(change => `${change.label}: ${change.state}`)], ['교차시장 테마', view.crossMarketThemes], ['투자지도 (Investment Map)', mapLines(view.investmentMap)], ['Event → Market Review', view.eventToMarketReview?.map(item => `${item.initialEventSummary}${item.koreaInterpretation ? ` · 국내 기관 해석: ${item.koreaInterpretation}` : ''}${item.subsequentMarketReaction ? ` · 이후 시장 반응: ${item.subsequentMarketReaction}` : ''}`)], ['주요 기업', view.majorCompanies], ['주요 업종', view.majorSectors], ['주요 리스크', view.majorRisks], ['월간 검토', view.monthReview], ['다음 달 체크포인트', view.nextMonthWatch]], view.sources); }
export function buildWeeklyPdfViewModel(view) { return { channel: 'PDF', format: 'WEEKLY_COMPACT', targetPages: { min: 3, max: 5 }, colorMaster: motusMarketColors, metadata: structuredClone(view.metadata), sections: [{ title: 'Executive Summary', items: [view.executiveSummary] }, { title: 'AI / U.S. / Korea', items: [...view.aiIntelligence, ...view.usMarket, ...view.koreaMarket] }, { title: 'Cross Intelligence', items: view.crossIntelligence ?? [] }, { title: 'Investment Map', items: mapLines(view.investmentMap) }, { title: 'Risk / Next Week', items: [...(view.riskSignals ?? []), ...view.nextWeekWatch] }].filter(section => section.items.length), sources: structuredClone(view.sources) }; }
export function buildMonthlyPdfViewModel(view) { return { channel: 'PDF', format: 'MONTHLY_LONG_FORM', colorMaster: motusMarketColors, metadata: structuredClone(view.metadata), sections: [{ title: 'Executive Summary', items: [view.executiveSummary] }, { title: 'Monthly Domains', items: [...view.aiIndustryMonthly, ...view.usMarketMonthly, ...view.koreaMarketMonthly] }, { title: 'Event to Market', items: view.eventToMarketReview?.map(item => item.initialEventSummary) ?? [] }, { title: 'Investment Map', items: mapLines(view.investmentMap) }, { title: 'Review / Next Month', items: [...view.monthReview, ...view.nextMonthWatch] }].filter(section => section.items.length), sources: structuredClone(view.sources) }; }
export function buildReportArchiveView(entries, filters) {
    const filtered = entries.filter(entry => (!filters.year || Number(entry.issueDate.slice(0, 4)) === filters.year) && (!filters.month || Number(entry.issueDate.slice(5, 7)) === filters.month) && (!filters.category || entry.category === filters.category) && (!filters.reportType || entry.reportType === filters.reportType));
    const candidates = [{ group: 'Daily', entries: filtered.filter(entry => entry.reportType.endsWith('_DAILY')) }, { group: 'Weekly', entries: filtered.filter(entry => entry.reportType === 'WEEKLY_INTELLIGENCE') }, { group: 'Monthly', entries: filtered.filter(entry => entry.reportType === 'MONTHLY_INTELLIGENCE') }];
    const groups = candidates.filter(group => group.entries.length);
    return { title: '리포트 (Reports)', filters: structuredClone(filters), groups };
}
export function renderReportArchive(view) { const groups = view.groups.map(group => `<h2 style="${bar}">${group.group}</h2><div style="${box}">${group.entries.map(entry => { const ctas = reportCtas(entry); return `<article style="border-bottom:1px solid #d6dee8;padding:0 0 14px;margin:0 0 14px"><strong style="display:block">${esc(entry.title)}</strong><span style="font-size:13px;color:#59697d">${esc(entry.issueDate)} · ${esc(MOTUS_PUBLIC_CATEGORY_MASTER[entry.category].displayLabel)}</span>${ctas.download ? `<a href="${attr(ctas.download)}" style="display:inline-block;margin:8px 12px 0 0;color:#0759a6">PDF 리포트 다운로드</a>` : ''}${ctas.article ? `<a href="${attr(ctas.article)}" style="display:inline-block;margin-top:8px;color:#0759a6">관련 글 보기</a>` : ''}</article>`; }).join('')}</div>`).join(''); return `<main data-product="motus-reports" style="${body}"><h1 style="${bar}">${esc(view.title)}</h1>${groups}</main>`; }
export function reportCtas(entry) { return { download: entry.state === 'AVAILABLE' && validHttps(entry.downloadUrl) ? entry.downloadUrl : null, article: entry.state === 'AVAILABLE' && validArticle(entry.articleUrl) ? entry.articleUrl : null }; }
function renderPeriod(metadata, summaryTitle, summary, sections, sources) { assertPeriodicContentQuality({ summary, sections, sources, nextWatch: sections.find(([title]) => /체크포인트/.test(title))?.[1] ?? [] }); const rendered = ['masthead', 'executive-summary']; const content = [`<main data-product="motus-${metadata.canonicalSlug}" style="${body}"><header style="background:#03162e;color:#fff;border-bottom:4px solid ${motusMarketColors.positive};box-shadow:inset 0 -1px 0 ${motusMarketColors.negative};padding:24px 20px;width:100%;max-width:100%;box-sizing:border-box"><strong>${MOTUS_DISPLAY_NAME}</strong><h1 style="font-size:29px;line-height:1.3;margin:8px 0">${esc(MOTUS_PUBLIC_CATEGORY_MASTER[metadata.category].displayLabel)}</h1><span>${esc(metadata.periodStart)} – ${esc(metadata.periodEnd)}</span></header>`, section(summaryTitle, [summary])]; for (const [title, items] of sections) {
    if (!items?.length)
        continue;
    rendered.push(title);
    content.push(section(title, items));
} if (sources.length) {
    rendered.push('sources');
    content.push(`<h2 style="${bar}">주요 출처</h2><div style="${box};font-size:14px">${dedupeSources(sources).map(source => `<p style="margin:0 0 8px"><a href="${attr(source.url)}" style="color:#0759a6;text-decoration:underline;font-weight:700">${esc(source.label)}</a></p>`).join('')}</div>`);
} content.push('</main>'); const html = content.join(''); if (/<script\b|<iframe\b|<style\b|\b(?:eventId|themeId|evidenceIds|sourceIds|verificationStatus|confidence)\b/i.test(html))
    throw new Error('public periodic HTML contains unsafe or internal content'); return { html, renderedSections: rendered, contentFingerprint: createHash('sha256').update(html).digest('hex') }; }
export function assertPeriodicContentQuality(input) { const prose = [input.summary, ...input.sections.flatMap(([, items]) => items ?? [])].join(' '); if (input.summary.trim().length < 80)
    throw new Error('periodic content requires context and meaning'); if (!/(때문|영향|조건|반면|따라|필요|확인)/.test(prose))
    throw new Error('periodic content requires supported meaning or change explanation'); if (!input.sources.length)
    throw new Error('periodic content requires evidence sources'); if (!input.nextWatch.length)
    throw new Error('periodic content requires next-watch items'); }
function section(title, items) { return `<h2 style="${bar}">${esc(title)}</h2><div style="${box}">${items.map(item => `<p style="margin:0 0 12px">${esc(item)}</p>`).join('')}</div>`; }
function metadata(category, id, start, end, observedDates, generatedAt, reasons) { return { publicationId: id, category, canonicalSlug: MOTUS_PUBLIC_CATEGORY_SLUGS[category], periodStart: start, periodEnd: end, observedDates, generatedAt, readiness: reasons.length ? 'HOLD' : 'READY', readinessReasons: reasons, review: { state: 'PENDING', reviewer: null, reviewedAt: null, history: [] } }; }
function mapLines(value) { if (!value)
    return []; return [...value.institutionalFocus.map(item => `기관 관심: ${item}`), ...value.crossMarketThemes.map(item => `교차시장 테마: ${item}`), ...value.discussedCompanies.map(item => `언급 기업: ${item}`), ...value.sectorAttention.map(item => `업종 관심: ${item}`), ...value.targetPriceChanges, ...value.ratingChanges, ...value.riskMentions.map(item => `리스크: ${item}`)]; }
function hasMap(value) { return Object.values(value).some(items => items.length > 0); }
function hasEvidence(item) { return item.evidenceIds.length > 0 && item.sourceIds.length > 0; }
function dedupeSources(items) { const map = new Map(); for (const item of items) {
    const key = `${canonical(item.url)}|${item.publisher ?? item.label}`;
    if (!map.has(key))
        map.set(key, { ...item, url: canonical(item.url) });
} return [...map.values()]; }
function canonical(value) { const url = new URL(value); for (const key of [...url.searchParams.keys()])
    if (key.startsWith('utm_'))
        url.searchParams.delete(key); url.hash = ''; return url.toString().replace(/\/$/, ''); }
function validHttps(value) { if (!value)
    return false; try {
    return new URL(value).protocol === 'https:' && /\.pdf(?:$|\?)/i.test(value);
}
catch {
    return false;
} }
function validArticle(value) { if (!value)
    return false; try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname.replace(/\/$/, '').length > 0;
}
catch {
    return false;
} }
function unique(values) { return [...new Set(values)]; }
function esc(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function attr(value) { return esc(value); }
export { motusMarketColors };
