import { createHash } from 'node:crypto';
import { buildGoldenIntelligenceRehearsal } from './golden-rehearsal.js';
import { renderAIIntelligenceDaily, renderKoreaMarketDaily, renderUSMarketDaily, splitNewsletterIntoDailyMasters } from './daily-masters.js';
export const splitReviewStates = ['PENDING', 'APPROVED', 'MODIFY', 'HOLD', 'REJECT'];
const AP_CLOSE = 'https://apnews.com/article/1ee73f14dc23f6139eeb12c7397f543e';
const AP_MARKET = 'https://apnews.com/article/e61d3d7b947a390c7eee6c8758e3095d';
const TREASURY = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value_month=202609&type=daily_treasury_yield_curve';
const CBOE_VIX = 'https://www.cboe.com/tradable-products/vix';
const DXY = 'https://es.investing.com/currencies/us-dollar-index-historical-data/';
const KOREA_CLOSE = 'https://www.markettimes.co.kr/2026/09/30/krx-%EB%A7%88%EA%B0%90-9%EC%9B%94-30%EC%9D%BC-%EC%BD%94%EC%8A%A4%ED%94%BC-3%EA%B1%B0%EB%9E%98%EC%9D%BC-%EC%97%B0%EC%86%8D-%ED%95%98%EB%9D%BD%EC%99%B8%EA%B5%AD%EC%9D%B8%EA%B8%B0%EA%B4%80-%EB%8F%99/';
const KOREA_CROSS = 'https://www.newsway.co.kr/news/view?ud=2026093015491609752';
const KOREA_FX = 'https://www.news1.kr/finance/market-exr/6306362';
export function createFirstSplitDailyProductionRun(generatedAt = '2026-10-01T09:00:00+09:00') {
    const source = buildGoldenIntelligenceRehearsal().newsletter;
    const base = splitNewsletterIntoDailyMasters(source);
    const ai = buildAI(base.ai);
    const us = buildUS(base.us);
    const korea = buildKorea(base.korea);
    return {
        generatedAt, selectedDates: { ai: ai.issueDate, us: us.issueDate, korea: korea.issueDate },
        units: [unit(ai, renderAIIntelligenceDaily(ai), ai.issues.length), unit(us, renderUSMarketDaily(us), us.marketHistory.series.length + us.supportingMetrics.length), unit(korea, renderKoreaMarketDaily(korea), korea.indexMetrics.length + korea.fxAndSupporting.length + korea.investorFlows.length + korea.sectors.length + korea.movers.length + korea.research.length)],
        externalActions: { bloggerInsertCount: 0, publishCount: 0 }
    };
}
export function recordSplitHumanReview(unit, to, reviewer, note, at) {
    if (!reviewer.trim() || !note.trim() || !Number.isFinite(Date.parse(at)))
        throw new Error('reviewer, note and valid reviewedAt are required');
    const audit = { at, from: unit.review.state, to, reviewer, note };
    return { ...structuredClone(unit), review: { state: to, reviewer, reviewedAt: at, history: [...unit.review.history, audit] } };
}
export async function createApprovedSplitDraft(unit, adapter) {
    if (unit.review.state !== 'APPROVED')
        throw new Error('Blogger draft blocked: publication unit Human Review APPROVED required');
    if (unit.publicationState === 'DRAFT' || unit.draftPostId)
        throw new Error('duplicate draft blocked: publication unit already has a draft');
    const existing = await adapter.findExistingDraft({ publicationId: unit.publicationId, observedDate: unit.observedDate, title: unit.title, label: unit.label });
    if (existing)
        return { ...structuredClone(unit), publicationState: 'DRAFT', draftPostId: existing.postId, duplicateCount: 1 };
    const created = await adapter.insertDraft({ publicationId: unit.publicationId, observedDate: unit.observedDate, title: unit.title, label: unit.label, content: unit.render.html });
    return { ...structuredClone(unit), publicationState: created.state, draftPostId: created.postId, duplicateCount: 0 };
}
function buildAI(base) {
    return { ...base, publicationId: 'motus-ai-intelligence-2026-09-29', issueDate: '2026-09-29', issueNumber: 2, title: '상시 실행형 에이전트와 AI 보안·과학 연구의 확장 (2026년 9월 29일)', subtitle: '공식 발표 3건으로 읽는 AI 산업의 다음 실행 조건', todayCore: { headline: 'AI 경쟁의 초점이 모델 성능에서 실제 업무 실행으로 옮겨갔다', summary: 'OpenAI는 장시간 작업을 이어가는 에이전트 환경을, NVIDIA는 에이전트 보안 프레임워크를, Microsoft Research는 생물학 연구용 월드 모델을 공개했다. 세 발표는 AI가 답변 생성 단계를 넘어 실행·통제·검증이 필요한 운영 시스템으로 확장되고 있음을 보여준다.', bullets: ['에이전트가 장시간 작업을 안정적으로 이어갈 실행 환경이 제품 경쟁의 핵심으로 부상', '보안과 권한 통제가 기업 도입 속도를 좌우하는 별도 기술 계층으로 확대', '과학 연구에서는 모델 성능보다 실험 설계와 검증 흐름에 연결되는지가 다음 관찰 지점'] }, industryFlow: ['에이전트 실행 환경', '에이전트 보안', 'AI for Science'], whatToWatch: [{ headline: '에이전트 운영 안정성', watchFor: '장시간 작업의 성공률과 실패 복구 방식, 기업용 권한 통제의 실제 적용 사례', validityHorizon: 'MEDIUM_TERM' }, { headline: 'AI for Science', watchFor: '연구 보조 도구가 실험 설계와 재현 가능한 결과로 이어지는지 확인', validityHorizon: 'MEDIUM_TERM' }] };
}
function buildUS(base) {
    const history = usHistory();
    return { ...base, publicationId: 'motus-us-market-2026-09-30', issueDate: '2026-09-30', issueNumber: 2, title: '미국 증시 마감: 장기금리 부담에 다우 약세, 나스닥은 소폭 상승 (2026년 9월 30일)', subtitle: '지수·금리·달러·유가로 읽는 미국시장 마감', marketSummary: '9월 마지막 거래일에는 지수 내부의 온도 차가 컸다. 나스닥은 0.24% 올랐지만 S&P 500과 러셀2000은 하락했고, 다우는 0.86% 밀렸다. 예상보다 완만한 물가 지표로 시작한 안도감은 견조한 성장 지표와 5.29%까지 오른 10년물 금리에 눌렸다.', marketHistory: history, supportingMetrics: [{ label: 'VIX', value: '15.99', change: '-0.31%', direction: 'DOWN' }, { label: '미국 10년물', value: '5.29%', change: '+3bp', direction: 'UP' }, { label: 'DXY', value: '100.95', change: '-0.16%', direction: 'DOWN' }, { label: 'Brent', value: '$98.03', change: '+1.90%', direction: 'UP' }], marketCommentary: ['장 초반에는 8월 PCE 물가가 시장 예상보다 낮게 나오며 금리 부담이 완화되는 듯했지만, 미국 경제의 성장세가 예상보다 강하다는 자료가 장기금리를 다시 끌어올렸다. 그 결과 금리에 민감한 광범위한 종목군은 약해졌고, 기술주 중심의 나스닥만 소폭 상승을 지켰다.', '다우와 러셀2000의 동반 약세는 상승이 시장 전체로 퍼지지 않았다는 뜻이다. VIX는 낮은 수준을 유지했지만, 10년물 5%대와 유가 반등이 이어지면 기업의 자금조달 비용과 밸류에이션 부담이 다시 부각될 수 있다.'], sectorsCompanies: ['MongoDB: 자사주 매입 확대와 경영진 변화 소식에 3.4% 상승', '대형 기술주: 나스닥의 상대 강세를 지지', '경기민감·중소형주: 높은 장기금리의 부담으로 상대 약세'], wallStreetResearch: [{ headline: '장기금리가 지수 확산을 제한한 세션', institutionView: 'Wells Fargo Investment Institute는 소비자가 예상보다 견조한 상태라고 평가했다.', motusInterpretation: '소비와 성장의 회복력은 실적에는 우호적이지만, 동시에 금리 인하 기대를 늦춰 고평가 성장주의 할인율 부담을 높인다. 다음 세션에서는 나스닥 강세가 더 넓은 업종으로 확산되는지 확인할 필요가 있다.', facts: ['S&P 500 -0.25%, Dow -0.86%, Nasdaq +0.24%, Russell 2000 -0.39%', '미국 10년물 국채금리 5.29%', 'Brent 98.03달러, 1.9% 상승'] }], checkpoints: [{ headline: '미국 10년물', watchFor: '5.3% 부근에서 추가 상승하는지와 성장주 반응', validityHorizon: 'SHORT_TERM' }, { headline: '시장 폭', watchFor: '나스닥의 상대 강세가 중소형주와 경기민감주로 확산되는지 확인', validityHorizon: 'SHORT_TERM' }, { headline: '유가', watchFor: 'Brent 반등이 기대인플레이션과 장기금리에 다시 전달되는지 확인', validityHorizon: 'SHORT_TERM' }], sources: [{ label: 'AP — 9월 30일 미국 주요지수 종가', url: AP_CLOSE, publisher: 'Associated Press' }, { label: 'AP — 미국시장 마감 해설', url: AP_MARKET, publisher: 'Associated Press' }, { label: 'U.S. Treasury — Daily Treasury Rates', url: TREASURY, publisher: 'U.S. Department of the Treasury' }, { label: 'Cboe — VIX', url: CBOE_VIX, publisher: 'Cboe' }, { label: 'DXY historical data', url: DXY, publisher: 'Investing.com' }] };
}
function buildKorea(base) {
    const research = base.research;
    return { ...base, publicationId: 'motus-korea-market-2026-09-30', issueDate: '2026-09-30', issueNumber: 2, title: '국내 증시 마감: 외국인·기관 매도에 코스피 하락, 코스닥은 반등 (2026년 9월 30일)', subtitle: '지수·환율·수급·업종·증권사 리서치로 읽는 국내시장', marketSummary: '코스피는 외국인과 기관의 동반 순매도에 0.48% 하락한 6,838.04로 마감했다. 반면 코스닥은 기관 순매수와 일부 반도체·장비주의 강세에 0.72% 올랐다. 원·달러 환율은 1,352.8원으로 3.9원 내려 환율 부담은 다소 완화됐지만, 대형주 수급은 여전히 무거웠다.', indexMetrics: [km('KOSPI', 'INDEX', 'KOSPI', '6,838.04 (-0.48%)', 'DOWN', KOREA_CLOSE), km('KOSDAQ', 'INDEX', 'KOSDAQ', '855.91 (+0.72%)', 'UP', KOREA_CLOSE)], fxAndSupporting: [km('USDKRW', 'FX', 'USD/KRW', '1,352.8원 (-3.9원)', 'DOWN', KOREA_FX)], investorFlows: [km('KOSPI-F', 'FLOW', 'KOSPI 외국인', '-2조 575억원', 'DOWN', KOREA_CLOSE), km('KOSPI-I', 'FLOW', 'KOSPI 기관', '-7,718억원', 'DOWN', KOREA_CLOSE), km('KOSPI-R', 'FLOW', 'KOSPI 개인', '+1조 1,721억원', 'UP', KOREA_CLOSE), km('KOSDAQ-F', 'FLOW', 'KOSDAQ 외국인', '-688억원', 'DOWN', KOREA_CROSS), km('KOSDAQ-I', 'FLOW', 'KOSDAQ 기관', '+488억원', 'UP', KOREA_CROSS), km('KOSDAQ-R', 'FLOW', 'KOSDAQ 개인', '+119억원', 'UP', KOREA_CROSS)], sectors: [km('SEC-INS', 'SECTOR', '보험', '-3.3%', 'DOWN', KOREA_CLOSE), km('SEC-FIN', 'SECTOR', '금융', '-1.4%', 'DOWN', KOREA_CLOSE), km('SEC-METAL', 'SECTOR', '코스닥 금속', '+1.9%', 'UP', KOREA_CLOSE), km('SEC-MACH', 'SECTOR', '코스닥 기계·장비', '+1.5%', 'UP', KOREA_CLOSE)], movers: [km('MOVE-SAMSUNG', 'MOVER', '삼성전자', '-1.47%', 'DOWN', KOREA_CROSS), km('MOVE-SKH', 'MOVER', 'SK하이닉스', '+0.62%', 'UP', KOREA_CROSS), km('MOVE-SOIL', 'MOVER', 'S-Oil', '+2.47%', 'UP', KOREA_CROSS), km('MOVE-DOOSAN', 'MOVER', '두산에너빌리티', '+2.38%', 'UP', KOREA_CROSS)], research, marketCommentary: ['코스피의 하락은 지수 전체의 위험회피라기보다 대형주에 집중된 외국인·기관 매도 영향이 컸다. 코스닥에서는 기관이 순매수로 전환했고 반도체 장비와 금속 업종이 강세를 보이면서 시장 내부 차별화가 뚜렷했다.', '국내 증권사 리서치는 AI 인프라와 기업용 에이전트의 장기 성장성을 다루면서도, 설비투자 집행과 추론 비용, 실제 고객 사용량을 확인해야 한다는 조건을 함께 제시했다. 단기 지수 방향과 장기 산업 논리를 분리해 볼 필요가 있다.'], checkpoints: [{ headline: '외국인 대형주 수급', watchFor: '코스피 대형주 순매도 강도가 완화되는지 확인', validityHorizon: 'SHORT_TERM' }, { headline: '코스닥 반도체 장비', watchFor: '기관 순매수와 업종 강세가 다음 거래일까지 이어지는지 확인', validityHorizon: 'SHORT_TERM' }, { headline: '원·달러 환율', watchFor: '1,350원 부근 안정 여부와 외국인 수급의 동행 확인', validityHorizon: 'SHORT_TERM' }], sources: dedupe([{ label: 'MarketTimes — 9월 30일 KRX 마감', url: KOREA_CLOSE, publisher: 'MarketTimes' }, { label: 'Newsway — 국내 증시 마감', url: KOREA_CROSS, publisher: 'Newsway' }, { label: 'News1 — 원·달러 환율 마감', url: KOREA_FX, publisher: 'News1' }, ...research.flatMap(item => item.sources)]) };
}
function usHistory() {
    const dates = ['2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30'];
    const previous = ['https://apnews.com/article/2487345eeaa8145f051da6b1d7e9f37d', 'https://apnews.com/article/36d06c7a598e03539e0e09bdf6b7ede2', 'https://apnews.com/article/095baa4855b9363bd7c4539ff65a6f13', 'https://apnews.com/article/69778ade7a033a10cb44b9078b6bb15d', AP_CLOSE];
    const make = (key, label, closes, latestChangePct) => ({ key, label, dates, closes, latestClose: closes[4], latestChangePct, sourceLabel: 'Associated Press market closes', sourceUrl: AP_CLOSE, provenance: dates.map((date, index) => ({ date, inputDate: date, field: 'close', sourceId: `AP-${date}`, sourceUrl: previous[index], collectionMode: 'MANUAL_VERIFIED' })) });
    return { asOf: '2026-09-30', sessionCount: 5, series: [make('sp500', 'S&P 500', [7704.13, 7743.41, 7683.69, 7670.84, 7651.54], -0.25), make('nasdaq', 'Nasdaq', [26939.37, 27068.72, 26820.38, 26797.54, 26861.06], 0.24), make('dow-jones', 'Dow Jones', [51349.98, 51828.62, 51481.51, 51349.92, 50906.05], -0.86), make('russell-2000', 'Russell 2000', [2835.57, 2837.55, 2817.91, 2807.92, 2796.86], -0.39)] };
}
function unit(view, render, itemCount) {
    const sourceCount = new Set(view.sources.map(source => source.url)).size;
    const readinessReasons = readiness(view, itemCount, sourceCount);
    return { publicationId: view.publicationId, category: view.category, observedDate: view.issueDate, title: view.title, label: view.canonicalLabel, sourceCount, itemCount, readiness: readinessReasons.length ? 'HOLD' : 'READY', readinessReasons, review: { state: 'PENDING', reviewer: null, reviewedAt: null, history: [] }, publicationState: 'PREVIEW_READY', draftPostId: null, publicPostUrl: null, duplicateCount: 0, contentFingerprint: createHash('sha256').update(render.html).digest('hex'), render, viewModel: structuredClone(view) };
}
function readiness(view, itemCount, sourceCount) {
    const issues = [];
    if (sourceCount === 0)
        issues.push('verified source required');
    if (view.category === 'AI_INTELLIGENCE' && view.issues.length < 2)
        issues.push('at least two verified AI events required');
    if (view.category === 'US_MARKET' && (view.marketHistory.sessionCount !== 5 || view.marketHistory.series.length !== 4 || view.supportingMetrics.length < 4))
        issues.push('four indices, five sessions and four supporting metrics required');
    if (view.category === 'KOREA_MARKET' && (!view.indexMetrics.length || !view.fxAndSupporting.length || view.investorFlows.length < 3 || !view.sectors.length || !view.movers.length || !view.research.length))
        issues.push('index, FX, flows, sectors, movers and research required');
    if (itemCount === 0)
        issues.push('verified items required');
    return issues;
}
function km(factId, group, label, displayValue, direction, url) { return { factId, group, label, displayValue, direction, source: { label: url === KOREA_CLOSE ? 'MarketTimes' : url === KOREA_CROSS ? 'Newsway' : 'News1', url } }; }
function dedupe(items) { const map = new Map(); for (const item of items)
    if (!map.has(item.url))
        map.set(item.url, item); return [...map.values()]; }
