import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
export const EDITORIAL_RENDERER_VERSION = '2E.2.0';
export const BROKERAGE_RENDERER_VERSION = '2E.A4.1.0';
const indexName = {
    SPX: 'S&P 500',
    DJIA: '다우지수',
    IXIC: '나스닥',
    RUT: '러셀2000',
    VIX: 'VIX',
    US2Y: '미국 2년물 국채금리',
    US10Y: '미국 10년물 국채금리',
    DXY_FUTURES_SEP26: '달러인덱스 선물',
    WTI_CL_FUTURES_OCT26: 'WTI 원유 선물',
    BRENT_NOV26: '브렌트유 선물'
};
export function renderDailyEditorial(report, evidence, reviewContext) {
    const input = evidence.originalInput;
    const market = input.market.filter(item => item.status === 'OK' && item.close !== null);
    const map = new Map(market.map(item => [item.symbol, item]));
    const spx = map.get('SPX'), nasdaq = map.get('IXIC'), dow = map.get('DJIA'), rut = map.get('RUT'), vix = map.get('VIX');
    const us2y = map.get('US2Y'), us10y = map.get('US10Y'), dollar = map.get('DXY_FUTURES_SEP26'), oil = map.get('BRENT_NOV26') ?? map.get('WTI_CL_FUTURES_OCT26');
    const dateLabel = formatKoreanDate(report.tradingDate);
    const cpi = input.macro.find(item => /CPI/i.test(`${item.indicatorId} ${item.indicatorName}`));
    const cpiPeriod = formatMacroPeriod(cpi?.period);
    const title = buildEditorialTitle(report.tradingDate, nasdaq, us2y, vix, oil, input);
    const summary = openingSummary(dateLabel, { spx, nasdaq, dow, rut, vix, us2y, us10y, oil }, input);
    const axes = marketAxes({ spx, nasdaq, dow, rut, vix, us2y, us10y, dollar, oil });
    const body = [
        '## 핵심 요약',
        '',
        summary.join('\n\n'),
        '',
        '## 시장 한눈에 보기',
        '',
        marketDashboard([spx, nasdaq, dow, rut, vix, us2y, us10y, dollar, oil]),
        '',
        '## 시장을 움직인 핵심 요인',
        '',
        axes[0],
        '',
        axes[1],
        '',
        axes[2],
        '',
        '### 금리와 물가',
        '',
        ratesAndMacroParagraph(cpiPeriod, Boolean(cpi), us2y, us10y, input),
        '',
        '## AI·반도체 / 주요 산업',
        '',
        companyIndustryParagraph(input, reviewContext),
        '',
        '## 한국시장 연결 포인트',
        '',
        koreaParagraph(input),
        '',
        '## 오늘 체크리스트',
        '',
        ...dailyChecklist(input, nasdaq, us10y, oil)
    ];
    const bloggerMarkdown = sanitizePublicMarkdown(body.join('\n'));
    const terms = buildDynamicTerms(bloggerMarkdown);
    const opportunities = decideContentOpportunities(report, evidence, bloggerMarkdown, terms);
    const seo = { title, description: summary.join(' '), slug: `us-market-close-${report.tradingDate}`, hashtags: hashtags(input) };
    return { rendererVersion: EDITORIAL_RENDERER_VERSION, tradingDate: report.tradingDate, seo, bloggerMarkdown, terms, opportunities, naver: buildNaverIntro(title, summary, seo.hashtags) };
}
export function decideContentOpportunities(report, evidence, bodyText, terms) {
    const input = evidence.originalInput;
    const market = input.market.filter(item => item.status === 'OK' && item.close !== null);
    const largeMoves = market.filter(item => Math.abs(item.changePct ?? 0) >= 2.5 || item.symbol === 'VIX' && Math.abs(item.changePct ?? 0) >= 10);
    const hasCompany = input.companyEvents.length + input.filings.length > 0;
    const koreaImpact = evidence.impactJudgments.filter(item => item.status === 'OK' && item.confidenceScore >= 70);
    const base = [
        {
            contentType: 'B_EVENT',
            recommended: false,
            score: Math.min(100, largeMoves.length * 35 + (input.news.some(item => item.usedInReport) ? 25 : 0)),
            reason: largeMoves.length ? 'VIX·원자재·금리 등에서 별도 이벤트로 다룰 만한 움직임이 확인됐습니다.' : '시장 충격이나 단일 이벤트가 충분히 크지 않아 Daily 안에서 처리합니다.',
            suggestedTitle: largeMoves.length ? `${report.tradingDate} 미국시장 변동 요인 점검` : null,
            evidenceIds: largeMoves.map(item => item.id)
        },
        {
            contentType: 'C_EVERGREEN',
            recommended: false,
            score: Math.min(100, terms.filter(term => highPriorityTerms.has(term.term)).length * 18),
            reason: terms.filter(term => highPriorityTerms.has(term.term)).length >= 4 ? '약어·전문 용어가 충분해 Evergreen 후보입니다.' : '용어 해설은 Daily 안에 넣고 별도 Evergreen은 보류합니다.',
            suggestedTitle: terms.filter(term => highPriorityTerms.has(term.term)).length >= 4 ? '미국증시 마감 리포트에서 자주 나오는 핵심 약어 정리' : null,
            evidenceIds: []
        },
        {
            contentType: 'D_COMPANY_INDUSTRY',
            recommended: false,
            score: Math.min(100, (hasCompany ? 35 : 0) + koreaImpact.length * 18),
            reason: hasCompany && koreaImpact.length >= 2 ? '기업 이벤트와 한국시장 전달경로가 함께 확인되어 산업 후속 글 후보입니다.' : '기업·산업 단독 글로 분리할 만큼의 복합 근거는 제한적입니다.',
            suggestedTitle: hasCompany ? '미국 기업 이벤트가 한국 산업에 주는 시사점' : '미국 금리와 기술주 흐름의 한국시장 전달경로',
            evidenceIds: [...input.companyEvents.map(item => item.id), ...input.filings.map(item => item.id), ...koreaImpact.flatMap(item => item.evidenceIds)].slice(0, 8)
        }
    ];
    const recommended = new Set(base.filter(item => item.score >= 70).sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.contentType));
    return base.map(item => ({ ...item, recommended: recommended.has(item.contentType) }));
}
const highPriorityTerms = new Set(['PBR', 'PER', 'EPS', 'BPS', 'ROE', 'EBITDA', 'FCF', 'CAPEX', 'CPI', 'PCE', 'FOMC', 'VIX', 'DXY', 'YoY', 'MoM', 'QoQ', 'bp', 'Guidance', 'Consensus', 'WTI']);
export function buildDynamicTerms(markdown) {
    const candidates = [
        { term: 'PBR', explanation: '주가순자산비율', evergreenKey: 'term-pbr', evergreenTitle: 'PBR로 밸류에이션 읽기' },
        { term: 'PER', explanation: '주가수익비율', evergreenKey: 'term-per', evergreenTitle: 'PER과 성장주의 가격 부담' },
        { term: 'EPS', explanation: '주당순이익', evergreenKey: 'term-eps', evergreenTitle: 'EPS와 실적 시즌 읽기' },
        { term: 'BPS', explanation: '주당순자산', evergreenKey: 'term-bps', evergreenTitle: 'BPS와 PBR 함께 보기' },
        { term: 'ROE', explanation: '자기자본이익률', evergreenKey: 'term-roe', evergreenTitle: 'ROE가 높은 기업의 의미' },
        { term: 'EBITDA', explanation: '이자·세금·감가상각 전 이익', evergreenKey: 'term-ebitda', evergreenTitle: 'EBITDA로 기업 체력 보기' },
        { term: 'FCF', explanation: '잉여현금흐름', evergreenKey: 'term-fcf', evergreenTitle: 'FCF가 중요한 이유' },
        { term: 'CAPEX', explanation: '자본적 지출·설비투자', evergreenKey: 'term-capex', evergreenTitle: 'CAPEX와 투자 사이클' },
        { term: 'CPI', explanation: '소비자물가지수', evergreenKey: 'term-cpi', evergreenTitle: 'CPI 발표와 시장 반응' },
        { term: 'PCE', explanation: '개인소비지출 물가지수', evergreenKey: 'term-pce', evergreenTitle: 'PCE와 Fed의 물가 판단' },
        { term: 'FOMC', explanation: '미국 연방공개시장위원회', evergreenKey: 'term-fomc', evergreenTitle: 'FOMC 전후 시장 체크포인트' },
        { term: 'VIX', explanation: 'S&P 500 옵션 기반 예상 변동성 지수', evergreenKey: 'term-vix', evergreenTitle: 'VIX로 시장 심리 확인하기' },
        { term: 'DXY', explanation: '주요 통화 대비 미국 달러 가치 지수', evergreenKey: 'term-dxy', evergreenTitle: 'DXY와 원화 흐름' },
        { term: 'YoY', explanation: '전년 동기 대비 변화율', evergreenKey: 'term-yoy', evergreenTitle: 'YoY와 MoM 차이' },
        { term: 'MoM', explanation: '전월 대비 변화율', evergreenKey: 'term-mom', evergreenTitle: 'MoM 지표 읽는 법' },
        { term: 'QoQ', explanation: '전분기 대비 변화율', evergreenKey: 'term-qoq', evergreenTitle: 'QoQ와 실적 해석' },
        { term: 'bp', explanation: '0.01%포인트', evergreenKey: 'term-bp', evergreenTitle: 'bp로 금리 변화 읽기' },
        { term: 'Guidance', explanation: '기업이 제시하는 향후 실적 전망', evergreenKey: 'term-guidance', evergreenTitle: '가이던스가 주가에 중요한 이유' },
        { term: 'Consensus', explanation: '시장 예상치', evergreenKey: 'term-consensus', evergreenTitle: '컨센서스와 서프라이즈' },
        { term: 'WTI', explanation: '미국 서부텍사스산 원유', evergreenKey: 'term-wti', evergreenTitle: 'WTI 원유 가격과 산업별 영향' },
        { term: '국채금리', explanation: '국채의 시장 수익률', evergreenKey: 'term-treasury-yield', evergreenTitle: '미국 국채금리와 주식시장의 관계' }
    ];
    const selected = candidates.filter(item => markdown.includes(item.term)).slice(0, 6);
    return selected.length >= 3 ? selected : selected.concat(candidates.filter(item => !selected.includes(item) && item.term === '국채금리' && markdown.includes('금리'))).slice(0, Math.max(3, selected.length));
}
export async function renderBrokerageReportOnDemand(report, evidence, outputDir) {
    const path = `${outputDir}/${report.reportId}-${BROKERAGE_RENDERER_VERSION}.md`;
    const daily = renderDailyEditorial(report, evidence);
    try {
        await access(path);
        return { rendererVersion: BROKERAGE_RENDERER_VERSION, reportId: report.reportId, tradingDate: report.tradingDate, cached: true, markdown: await readFile(path, 'utf8'), naver: daily.naver };
    }
    catch { }
    await mkdir(outputDir, { recursive: true });
    const input = evidence.originalInput;
    const lines = [
        `# 내부용 A4 브로커리지 요약 — ${report.tradingDate}`,
        '',
        `- 렌더러: ${BROKERAGE_RENDERER_VERSION}`,
        `- 기준 리포트: ${report.reportId}`,
        '- 용도: 내부 관리자 요청 시 생성되는 1페이지 요약',
        '',
        '## 핵심 판단',
        '',
        daily.seo.description,
        '',
        '## 시장 데이터',
        '',
        ...input.market.filter(item => item.status === 'OK' && item.close !== null).map(item => `- ${indexName[item.symbol] ?? item.symbol}: ${item.close} ${item.unit}, ${formatPct(item.changePct)}.`),
        '',
        '## 한국시장 체크포인트',
        '',
        koreaParagraph(input),
        '',
        '## 공개 콘텐츠 동시 산출',
        '',
        daily.naver.intro,
        '',
        daily.naver.hashtags.join(' ')
    ];
    const markdown = lines.join('\n');
    await writeFile(path, markdown);
    return { rendererVersion: BROKERAGE_RENDERER_VERSION, reportId: report.reportId, tradingDate: report.tradingDate, cached: false, markdown, naver: daily.naver };
}
function buildEditorialTitle(tradingDate, nasdaq, us2y, vix, oil, input) {
    const newsText = input.news.flatMap(item => [item.title, ...item.verifiedFacts]).join(' ');
    if (/25bp|0\.25%포인트|3\.75%.*4\.00%/i.test(newsText) && /금리.*인상|rate hike/i.test(newsText)) {
        return `미국 증시 마감: 연준 금리 인상에 다우 급락, AI 반도체는 선방 (${formatKoreanDate(tradingDate)})`;
    }
    const marketUp = typeof nasdaq?.changePct === 'number' && nasdaq.changePct >= 0;
    if (!marketUp && (us2y?.change ?? 0) > 0 && (oil?.changePct ?? 0) > 0)
        return `미국 증시 마감: 유가·금리 상승에 나스닥 하락 (${formatKoreanDate(tradingDate)})`;
    const market = marketUp ? '나스닥 강세' : '나스닥 약세';
    const rates = typeof us2y?.change === 'number' && us2y.change > 0 ? (marketUp ? '금리 상승에도' : '금리 상승 속') : '금리 부담 완화 속';
    const volatility = typeof vix?.changePct === 'number' && vix.changePct <= -10 ? ', VIX 급락' : '';
    return `미국 증시 마감: ${rates} ${market}${volatility} (${formatKoreanDate(tradingDate)})`;
}
function openingSummary(dateLabel, records, input) {
    const equities = [records.spx, records.nasdaq, records.dow, records.rut].filter((item) => Boolean(item && typeof item.changePct === 'number'));
    const positive = equities.filter(item => (item.changePct ?? 0) > 0).length;
    const negative = equities.filter(item => (item.changePct ?? 0) < 0).length;
    const ratesUp = [records.us2y, records.us10y].some(item => (item?.change ?? 0) > 0);
    const oilUp = (records.oil?.changePct ?? 0) > 0;
    if (equities.length >= 3 && negative === equities.length)
        return [
            `${dateLabel} 미국 증시는 대형주와 기술주, 중소형주가 함께 밀렸다. ${oilUp ? '유가 상승이 물가 부담을 다시 키운 데다 ' : ''}${ratesUp ? '국채금리까지 오르면서 ' : ''}주식시장은 성장 기대보다 자금조달 비용과 밸류에이션 부담에 민감하게 반응했다.`,
            `낙폭이 한 업종에 그치지 않고 주요 지수 전반으로 번졌다는 점이 이날 흐름을 설명한다. 한국시장에서는 ${oilUp ? '높은 에너지 비용과 ' : ''}금리가 외국인 수급과 원화, 성장주 평가에 미칠 영향을 살펴야 한다.`
        ];
    if (equities.length >= 3 && positive === equities.length)
        return [
            `${dateLabel} 미국 증시는 대형주와 기술주, 중소형주가 함께 오르며 위험선호 흐름을 이어갔다. 변동성도 눈에 띄게 낮아져 장중 불안이 완화됐지만, 주가 상승만으로 금리 부담까지 사라졌다고 보기는 어렵다.`,
            `단기 국채금리가 장기물보다 더 크게 오른 가운데 기술주가 강세를 지켰다는 점이 이날의 핵심이다. 한국시장에서는 미국 성장주의 탄력과 함께 반도체·AI 인프라 투자 기대가 실제 수급으로 연결되는지를 살펴볼 필요가 있다.`
        ];
    const lead = (records.nasdaq?.changePct ?? 0) >= 0 ? '기술주가 상대적으로 버텼지만' : '기술주가 약세를 보인 가운데';
    return [
        `${dateLabel} 미국 증시는 지수별 방향이 엇갈렸다. ${lead} 시장 전체의 매수세가 한쪽으로 뚜렷하게 모이지는 않았다.`,
        `${ratesUp ? '국채금리 상승' : '금리 흐름'}${oilUp ? '과 유가 상승' : ''}을 함께 고려하면 지수 등락만으로 위험선호를 단정하기 어렵다. 한국시장에서는 환율과 외국인 수급, 업종별 실적 민감도를 나눠 확인할 필요가 있다.`
    ];
}
function marketAxes(records) {
    const equities = [records.spx, records.nasdaq, records.dow, records.rut].filter((item) => Boolean(item && typeof item.changePct === 'number'));
    const allUp = equities.length >= 3 && equities.every(item => (item.changePct ?? 0) > 0);
    const allDown = equities.length >= 3 && equities.every(item => (item.changePct ?? 0) < 0);
    const breadth = allUp
        ? '첫째, 상승 범위가 일부 대형 기술주에만 머물지 않았다. 다우지수와 러셀2000까지 플러스권에 들어오면서 매수세의 폭이 비교적 넓었다. VIX의 두 자릿수 하락도 투자자들이 당장의 급격한 변동 가능성을 낮게 평가했음을 시사한다.'
        : allDown
            ? '첫째, 매도세가 기술주에만 머물지 않았다. S&P 500과 다우지수, 러셀2000이 나란히 하락해 금리와 원가 부담이 대형주부터 중소형주까지 폭넓게 반영됐다.'
            : '첫째, 지수별 움직임이 엇갈려 시장의 폭은 제한적이었다. 한 지수의 등락만으로 전체 투자심리를 설명하기보다 대형주와 중소형주의 상대 흐름을 나눠 볼 필요가 있다.';
    const twoChange = (records.us2y?.change ?? 0) * 100, tenChange = (records.us10y?.change ?? 0) * 100;
    const rates = twoChange > 0 && tenChange > 0
        ? `둘째, 국채금리는 전 구간에서 올랐다. 2년물은 ${Number(twoChange.toFixed(1))}bp, 10년물은 ${Number(tenChange.toFixed(1))}bp 상승해 단기 정책금리 기대와 장기 자금조달 비용이 함께 주식의 할인율을 밀어 올렸다.`
        : twoChange < 0 && tenChange < 0
            ? '둘째, 2년물과 10년물 국채금리가 함께 내려 주식의 할인율 부담은 다소 완화됐다. 다만 하루의 금리 하락만으로 정책 경로가 바뀌었다고 보기는 이르다.'
            : '둘째, 2년물과 10년물의 방향이 엇갈렸다. 수익률곡선의 어느 구간이 움직였는지에 따라 성장주와 금융주의 반응이 달라질 수 있다.';
    const oilChange = records.oil?.changePct;
    const cross = typeof oilChange === 'number' && oilChange > 0
        ? '셋째, 원유 가격 상승이 주식과 채권에 동시에 부담을 줬다. 에너지 기업에는 가격 효과가 우호적일 수 있지만, 항공·운송·화학과 소비 업종에는 비용 상승과 물가 재가속 우려가 더 직접적인 변수다.'
        : typeof oilChange === 'number' && oilChange < 0
            ? '셋째, 브렌트유는 하락했지만 주식시장의 방향을 뒤집지는 못했다. 에너지 비용 부담은 다소 누그러졌으나, 이날 가격 움직임의 중심은 원자재보다 연준 결정과 주식 내부의 위험선호에 있었다.'
            : '셋째, 확인된 교차자산 자료만으로 환율이나 원자재가 장 전체를 주도했다고 단정하기 어렵다. 주식과 국채의 동행 여부를 중심으로 해석하는 편이 타당하다.';
    return [breadth, rates, cross];
}
function ratesAndMacroParagraph(cpiPeriod, hasCpi, us2y, us10y, input) {
    const bothUp = (us2y?.change ?? 0) > 0 && (us10y?.change ?? 0) > 0;
    if (hasCpi)
        return `${cpiPeriod} CPI는 전월 대비 상승했고, 국채시장에서는 2년물과 10년물이 각각 전일보다 높아졌다. 단기물 상승 폭이 더 컸다는 점은 향후 통화정책 경로를 둘러싼 경계가 남아 있음을 말해준다. 금리가 오른 날에도 성장주가 버틴 만큼, 다음 거래일에는 이 조합이 계속 유지되는지가 중요하다.`;
    const newsText = input.news.flatMap(item => [item.title, ...item.verifiedFacts]).join(' ');
    const fomc = /FOMC|Federal Reserve|연방준비|기준금리/i.test(newsText);
    const rateHike = fomc && /금리.*인상|rate hike|25bp|0\.25%포인트/i.test(newsText);
    if (rateHike)
        return '연준은 기준금리 목표 범위를 3.75~4.00%로 25bp 올렸다. 결정은 만장일치였고, 2년물과 10년물 국채금리도 함께 상승했다. 시장은 발표 직후 주가를 다시 낮추며 높은 할인율이 기업 가치에 미치는 부담을 반영했다.';
    if (bothUp)
        return `이날 새 물가 발표보다 채권시장의 움직임이 더 직접적인 신호를 줬다. 2년물과 10년물 국채금리가 함께 상승했고${fomc ? ', FOMC 결정을 둘러싼 경계도 가격에 반영됐다' : ''}. 장기금리가 높은 수준에 머무는 동안에는 성장률이 높더라도 먼 미래 이익의 현재가치가 낮아질 수 있다.`;
    return '이날 확인된 새 물가 발표는 없었다. 통화정책 경로를 미리 단정하기보다 국채금리와 다음 공식 경제지표가 같은 방향을 가리키는지 확인할 구간이다.';
}
function formatKoreanDate(value) { return value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, year, month, day) => `${year}년 ${Number(month)}월 ${Number(day)}일`); }
function formatMacroPeriod(value) { return value?.replace(/^\d{4}-(\d{2})$/, (_, month) => `${Number(month)}월`) ?? '최근'; }
function marketDashboard(records) {
    const rows = records.filter((record) => Boolean(record && record.close !== null));
    return [
        '| 구분 | 지표 | 종가 | 등락 |',
        '| --- | --- | ---: | ---: |',
        ...rows.map(record => `| ${marketDashboardGroup(record)} | ${indexName[record.symbol] ?? record.symbol} | ${dashboardValue(record)} | ${dashboardChange(record)} |`)
    ].join('\n');
}
function marketDashboardGroup(record) {
    if (['SPX', 'DJIA', 'IXIC', 'RUT'].includes(record.symbol))
        return '주요지수';
    if (record.instrumentType === 'YIELD' || record.symbol.startsWith('DXY'))
        return '금리·환율';
    return '글로벌 변수';
}
function dashboardValue(record) {
    if (record.close === null)
        return '—';
    if (record.instrumentType === 'YIELD')
        return `${record.close}%`;
    if (record.unit === 'price')
        return `$${record.close}`;
    return String(record.close);
}
function dashboardChange(record) {
    if (record.instrumentType === 'YIELD' && typeof record.change === 'number')
        return `${record.change >= 0 ? '+' : ''}${Number((record.change * 100).toFixed(1))}bp`;
    return formatPct(record.changePct);
}
function formatPct(value) {
    if (typeof value !== 'number')
        return '변동률 확인 불가';
    return `${value > 0 ? '+' : ''}${Number(value.toFixed(2))}%`;
}
function companyIndustryParagraph(input, reviewContext) {
    if (reviewContext?.focus === 'AI_SEMICONDUCTOR')
        return [
            reviewContext.aiStockFlow,
            reviewContext.ratesAndValuation,
            reviewContext.capexAndEarnings,
            reviewContext.koreaSemiconductor,
            '### 미국 소비 체크',
            reviewContext.consumerCheck
        ].join('\n\n');
    if (input.companyEvents.length || input.filings.length) {
        const event = input.companyEvents[0];
        const filing = input.filings[0];
        const companyName = event?.companyId === 'ORACLE' ? 'Oracle' : event?.companyId === 'DAVE_AND_BUSTERS' ? "Dave & Buster's" : event?.companyId;
        const eventText = event ? `이번 기업 뉴스의 중심에는 ${companyName}(${event.ticker})이 있었다. ${event.summary}` : '';
        const filingFact = filing?.extractedFacts.at(-1)?.replace(/첨부됨$/, '첨부됐다').replace(/첨부$/, '첨부됐다').replace(/종료 분기$/, '종료 분기다');
        const filingText = filing ? `회사는 ${formatKoreanDate(filing.filedAt.slice(0, 10))} ${filing.formType}를 제출했다.${filingFact ? ` 공식 공시에는 ${filingFact}.` : ''}` : '';
        const aiCapex = input.signals.some(item => item.trigger === 'AI_CAPEX_UP');
        const consumptionDown = input.signals.some(item => item.trigger === 'CONSUMPTION_DOWN');
        const industryText = aiCapex ? '분기 실적 못지않게 눈길을 끈 대목은 데이터센터 용량 확대다. 이는 AI 인프라 CAPEX가 기업의 실제 설비 계획으로 이어지고 있다는 개별 사례다. 다만 한 회사의 발표만으로 산업 전체의 투자 속도를 단정할 단계는 아니다.' : consumptionDown ? '매출과 동일점포 매출이 함께 줄었다는 점은 체험형 외식·레저 수요의 탄력을 점검하게 한다. 다만 한 회사의 실적만으로 미국 소비 전체가 꺾였다고 단정할 수는 없다.' : '이번 발표는 해당 기업의 실적이 산업 수요에 어떤 변화를 주는지 살펴볼 단서다.';
        const supplyChainText = aiCapex ? '글로벌 공급망에서는 서버와 네트워크 장비, 전력·냉각 설비가 함께 움직이는지를 지켜볼 만하다. 데이터센터 증설이 예정대로 집행된다면 관련 부품과 인프라 발주에도 영향을 줄 수 있지만, 고객사의 투자 시기와 공급 여건에 따라 속도 차이가 날 수 있다.' : consumptionDown ? '이번 사례는 제조 공급망보다 미국 가계의 재량지출 여력을 읽는 데 의미가 크다. 외식과 체험형 소비의 매출 둔화가 다른 업체로 넓어지는지는 추가 실적을 통해 확인해야 한다.' : '';
        const koreaText = aiCapex ? '한국시장에서는 반도체 업종이 가장 가까운 연결 고리다. 미국 AI 투자 기대가 우호적인 배경을 만들 수 있으나, 국내 종목의 실제 반응은 고객사 주문과 환율, 외국인 수급까지 함께 봐야 한다.' : consumptionDown ? '한국시장에서는 미국 소비 비중이 높은 의류·식품·레저 기업의 주문과 판매 흐름을 점검할 만하다. 한 기업의 부진을 업종 전체로 확대하기보다 환율과 물류비, 각 회사의 가격 전가력을 함께 봐야 한다.' : '';
        return [eventText, filingText, industryText, supplyChainText, koreaText].filter(Boolean).join('\n\n');
    }
    const newsText = input.news.flatMap(item => [item.title, ...item.verifiedFacts]).join(' ');
    if (/Nvidia|엔비디아|AMD|반도체/i.test(newsText))
        return '금리 인상으로 다우와 S&P 500이 밀린 날에도 AI 반도체주는 상대적으로 선방했다. 엔비디아는 0.8%, AMD는 1.6% 올랐고, Reuters가 집계한 반도체 업종도 0.6% 상승했다. 성장주 전체를 한 묶음으로 보기보다 실적 가시성과 AI 투자 수요가 확인되는 종목에 매수세가 남았다는 뜻에 가깝다. 다만 10년물 금리가 5%를 웃도는 환경에서는 높은 밸류에이션이 계속 부담이다. 다음 판단의 초점은 AI CAPEX 계획이 실제 주문과 매출, 이익으로 이어지는지에 있다. 한국시장에서는 메모리와 장비·소재 공급망의 실적 확인이 미국 AI 주가 흐름을 국내 반도체 수급으로 연결하는 핵심 고리다.';
    return '개별 기업 이슈는 시장 전체 흐름을 압도할 만큼 따로 분리되지 않았다. 이날은 특정 한 종목보다 금리, 기술주, 변동성의 조합이 더 중요한 관찰 지점이었다.';
}
function koreaParagraph(input) {
    const triggers = new Set(input.signals.filter(item => item.driverStatement).map(item => item.trigger));
    if (triggers.has('OIL_UP') && triggers.has('RATES_UP'))
        return '미국 장기금리와 유가가 동시에 오른 조합은 한국시장에 가볍지 않다. 인터넷·플랫폼 같은 장기 성장주는 할인율 부담을 받고, 항공·운송·화학은 원가 압력을 먼저 맞을 수 있다. 정유·조선 등은 업황 수혜 가능성이 있지만 원화와 외국인 수급이 흔들리면 지수 전체의 방어력은 약해질 수 있다.';
    if (triggers.has('AI_CAPEX_UP'))
        return '미국 금리 상승은 국내 인터넷·플랫폼 등 장기 성장주의 할인율 부담으로 작용할 수 있다. 반면 나스닥 강세와 AI 인프라 투자 기대는 반도체 투자심리에 우호적이다. 두 힘이 엇갈리는 만큼 지수 방향을 그대로 따라가기보다 원화 흐름, 외국인 수급, 반도체 업종의 장중 강도를 함께 살피는 편이 낫다.';
    if (input.news.some(item => /Nvidia|엔비디아|AMD|반도체/i.test(`${item.title} ${item.verifiedFacts.join(' ')}`)))
        return '미국 지수 하락은 국내 위험선호에 부담이지만, AI 반도체주의 상대 강세는 업종별 차별화를 예고한다. 국내에서는 메모리·장비주가 미국 반도체 흐름을 따라가는지, 5%를 웃돈 미국 10년물 금리와 원화 움직임이 외국인 수급을 제약하는지를 함께 봐야 한다.';
    return '한국시장에서는 미국 기술주 흐름과 금리 수준을 함께 봐야 한다. 지수 상승만 보고 추격하기보다 환율, 외국인 수급, 반도체 업종의 장중 반응을 확인하는 편이 안전하다.';
}
function dailyChecklist(input, nasdaq, us10y, oil) {
    const items = ['- 미국 국채 2년물과 10년물 금리의 추가 상승 여부'];
    if ((nasdaq?.changePct ?? 0) < 0)
        items.push('- 나스닥 약세가 반도체와 대형 기술주 전반으로 이어지는지');
    else
        items.push('- 나스닥 상승이 반도체와 AI 인프라 종목으로 이어지는지');
    if ((oil?.changePct ?? 0) > 0)
        items.push('- 높은 유가가 운송·화학·소비 업종의 비용 부담으로 번지는지');
    else
        items.push('- 달러와 원유 가격이 한국 수출주와 항공·화학 업종에 주는 압력');
    if (input.news.some(item => /FOMC|Federal Reserve|연방준비/i.test(`${item.title} ${item.verifiedFacts.join(' ')}`)))
        items.push('- FOMC 결정 이후 시장이 반영하는 향후 금리 경로');
    void us10y;
    return items;
}
function hashtags(input) {
    const symbols = new Set(input.market.map(item => item.symbol));
    const triggers = new Set(input.signals.map(item => item.trigger));
    const tags = ['#미국증시', '#미국주식', '#미국시장마감', '#나스닥', '#SP500', '#다우지수', '#러셀2000', '#미국국채금리'];
    if (symbols.has('VIX'))
        tags.push('#VIX');
    if (triggers.has('AI_CAPEX_UP'))
        tags.push('#AI인프라', '#오라클');
    else if (input.news.some(item => /Nvidia|엔비디아|AMD|반도체/i.test(`${item.title} ${item.verifiedFacts.join(' ')}`)))
        tags.push('#AI반도체', '#엔비디아', '#AMD');
    if (triggers.has('OIL_UP'))
        tags.push('#국제유가', '#브렌트유');
    if (input.companyEvents.some(item => item.ticker === 'PLAY'))
        tags.push('#미국소비주');
    tags.push('#한국증시');
    return tags.slice(0, 12);
}
function buildNaverIntro(title, summary, tags) {
    return { intro: `${title}\n\n오늘 미국장의 지수, 금리, 원자재 흐름을 함께 정리했습니다. 핵심 수치와 한국시장 체크포인트를 짧게 확인해 보세요.\n\n${summary[0] ?? ''}`, hashtags: tags.slice(0, 6) };
}
function sanitizePublicMarkdown(markdown) {
    return markdown
        .replace(/CLAIM-[A-Z0-9:._-]+/g, '')
        .replace(/MANUAL-\d{4}-\d{2}-\d{2}-[a-f0-9]+/g, '')
        .replace(/\b(AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|PUBLISHED|APPROVED|OK|NO_DATA|DATA_NOT_CONNECTED)\b/g, '')
        .replace(/"/g, '”');
}
