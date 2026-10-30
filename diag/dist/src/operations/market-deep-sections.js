/**
 * Composes the expert and search-ranked parts of the U.S. and Korea daily articles from collected evidence.
 * Every sentence either restates a verified number or quotes a named broker verbatim with its date and report;
 * nothing here invents a cause, a rating or a target.
 */
import { josa } from './ai-generic-synthesis.js';
import { analystLabel, koreanDateLabel } from './broker-briefs.js';
import { displayName, moveWord, signedPct, absPct } from './market-attention.js';
const quote = (value) => `“${value.replace(/[“"]/g, '‘').replace(/[”]/g, '’').replace(/\s+/g, ' ').trim().replace(/[.。]$/, '')}”`;
/** “…”라고 / “…”이라고 by the final syllable of the quotation. */
function said(quotes) { const last = quotes.at(-1) ?? '', char = last.replace(/[”’\s]+$/, '').slice(-1), code = char.charCodeAt(0) - 0xac00; const batchim = code >= 0 && code < 11172 && code % 28 !== 0; return `${quotes.join(', ')}${batchim ? '이라고' : '라고'}`; }
/** Statements that describe the market as a whole lead; side notes (FX, oil) follow. */
function marketScore(text) { const digits = (text.match(/\d/g) ?? []).length / Math.max(text.length, 1); return (/마감|지수|증시|코스피|KOSPI|나스닥|S&P|다우|3대/.test(text) ? 2 : 0) + (/상승|하락|강세|약세|급등|급락|반등/.test(text) ? 1 : 0) + (/힘입|기대|영향|덕분|때문|배경|우려|부진|악화|쇼크|하회|상회|호실적|속에?\s|에\s?(?:상승|하락|급등|급락|강세|약세)/.test(text) ? 3 : 0) - (digits > 0.12 ? 3 : 0); }
const reportSource = (report) => ({ label: `${report.broker} ${report.title} (${koreanDateLabel(report.date)})`, url: report.url });
const sourceEntry = (report) => ({ label: `${report.broker} 「${report.title}」 (${report.date})`, url: report.url, publisher: report.broker, date: report.date });
function subject(report) { return josa(analystLabel(report), '은', '는'); }
function won(value) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value); }
function usd(value) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function indexMove(value) { const size = Math.abs(value); if (size < 0.005)
    return '보합'; if (value > 0)
    return size >= 2 ? '급등' : '상승'; return size >= 2 ? '급락' : '하락'; }
function digestParagraph(digest, brief, limit = 3) {
    const who = digest.analyst ? `${brief.report.broker} ${digest.analyst} 연구원` : analystLabel(brief.report);
    return { text: `${josa(who, '은', '는')} 「${digest.heading.replace(/\s+/g, ' ')}」에서 ${said(digest.bullets.slice(0, limit).map(quote))} 밝혔다.`, source: reportSource(brief.report) };
}
function ratingSentence(report) {
    const parts = [report.rating ? `투자의견 ${report.rating}` : '', report.targetPrice ? `목표주가 ${report.targetPrice}원` : ''].filter(Boolean);
    const headline = report.company ? report.title.replace(/^.+?\(\d{6}\)\s*/, '') : report.title;
    return `${subject(report)} ${koreanDateLabel(report.date)} 「${headline}」 리포트에서 ${parts.length ? parts.join(', ') + '을 제시했다' : '관련 분석을 내놨다'}${report.summary.length ? `. 요약: ${report.summary.slice(0, 2).map(quote).join(', ')}` : ''}.`;
}
// Theme names are neutral: keyword matches carry no direction, so a shared theme never turns concerns into optimism.
const THEMES = [['반도체', /반도체|하이닉스|HBM|메모리|필라델피아/], ['AI 투자', /AI|인공지능|빅테크/], ['FOMC·통화정책', /FOMC|연준|금리|기준금리|Fed/], ['기업 실적', /실적|어닝|영업이익/], ['외국인·기관 수급', /외국인|기관|순매수|순매도|사이드카/], ['환율·달러', /환율|달러/], ['국제유가', /유가|원유/], ['주주환원', /주주환원|배당|자사주/]];
const CAUSAL = /힘입|기대|우려|영향|때문|따른|따라|반영|부담|속에?\s|에\s?(?:상승|하락|급등|급락|강세|약세|반등)|실적|FOMC|연준|금리|동결|인상|인하|유가|달러|환율|수급|순매수|순매도|매수세|매도세|사이드카|발표|주주환원|정책|관세|지표|물가|고용|투자심리/;
const CAUTION = /우려|경계|부담|리스크|불확실|하락 전환|차익실현|관망|둔화|대기|엇갈|급락/;
const KOREA_MARKET = /코스피|KOSPI|양대 지수|코스닥|KOSDAQ|국내 증시|국내증시|유가증권시장|외국인|기관|삼성전자|하이닉스|삼전/;
const OTHER_FOR_KOREA = /뉴욕|미 증시|미국 증시|나스닥|S&P|다우|알파벳|마이크로소프트|\bMS\b|아마존|엔비디아|애플|메타|테슬라|인텔|구글/;
/** Splits each broker's session commentary into drivers and cautions, one short quote per broker for each. */
function causes(briefs, region) {
    const drivers = [], cautions = [];
    for (const brief of briefs) {
        // A line under a regional heading can still be about the other market; it never explains this one.
        const items = brief.statements.filter(item => item.region === region && item.text.length <= 130 && !(region === 'KOREA' ? OTHER_FOR_KOREA.test(item.text) && !KOREA_MARKET.test(item.text) : KOREA_MARKET.test(item.text)));
        // The best explanation of the session is the driver whatever its direction (a bearish close explained by
        // 'concerns' is still the explanation); a caution is a different statement that flags a risk.
        // Only a statement that gives a reason counts; a restatement of index moves explains nothing.
        const driver = [...items].filter(item => CAUSAL.test(item.text)).sort((a, b) => marketScore(b.text) - marketScore(a.text))[0];
        const caution = items.find(item => item !== driver && CAUTION.test(item.text));
        if (driver)
            drivers.push({ text: driver.text, brief });
        if (caution)
            cautions.push({ text: caution.text, brief });
    }
    return { drivers: drivers.slice(0, 4), cautions: cautions.slice(0, 2) };
}
/** Which themes several brokers name independently, and which only one broker names. */
function consensus(picks, allStatements) {
    const brokers = [...new Set(allStatements.map(item => item.brief.report.broker))];
    if (!picks.length || brokers.length < 2)
        return null;
    const themesOf = (broker) => THEMES.filter(([, pattern]) => allStatements.some(item => item.brief.report.broker === broker && pattern.test(item.text))).map(([label]) => label);
    const shared = THEMES.map(([label, pattern]) => ({ label, names: brokers.filter(broker => allStatements.some(item => item.brief.report.broker === broker && pattern.test(item.text))) })).filter(item => item.names.length >= 2).sort((a, b) => b.names.length - a.names.length);
    if (shared.length) {
        const top = shared.slice(0, 2), covered = new Set(top.flatMap(item => item.names)), outliers = brokers.filter(broker => !covered.has(broker) && themesOf(broker).length);
        const tail = outliers.length ? ` ${outliers.map(broker => `${josa(broker, '은', '는')} ${themesOf(broker).slice(0, 2).join('·')}${josa(themesOf(broker).slice(0, 2).join('·'), '을', '를').slice(-1)}`).join(', ')} 따로 짚었다.` : '';
        return `증권사 ${brokers.length}곳의 리포트를 대조하면 ${top.map(item => `${item.label}(${item.names.join('·')})`).join(', ')}${josa(top.at(-1).label, '이', '가').slice(-1)} 공통으로 꼽힌 배경이다.${tail}`;
    }
    const views = brokers.map(broker => ({ broker, themes: themesOf(broker) })).filter(item => item.themes.length);
    if (views.length < 2)
        return null;
    return `증권사들이 강조한 배경은 엇갈렸다. ${views.map(item => `${josa(item.broker, '은', '는')} ${item.themes.slice(0, 2).join('·')}`).join(', ')}에 무게를 뒀다.`;
}
function causeParagraphs(briefs, region) {
    const { drivers, cautions } = causes(briefs, region), all = briefs.flatMap(brief => brief.statements.filter(item => item.region === region).map(item => ({ text: item.text, brief })));
    const paragraphs = [];
    const summary = consensus(drivers, all);
    if (summary)
        paragraphs.push({ text: 'MOTUS 정리: ' + summary });
    for (const pick of drivers)
        paragraphs.push({ text: `${subject(pick.brief.report)} ${koreanDateLabel(pick.brief.report.date)} ${/마감|레이더/.test(pick.brief.report.title) ? '마감 코멘트' : '아침 리포트'} 「${pick.brief.report.title}」에서 ${said([quote(pick.text)])} 진단했다.`, source: reportSource(pick.brief.report) });
    for (const pick of cautions)
        paragraphs.push({ text: `경계 요인도 제시됐다. ${subject(pick.brief.report)} ${said([quote(pick.text)])} 짚었다.`, source: reportSource(pick.brief.report) });
    return { paragraphs, first: [...drivers].sort((a, b) => marketScore(b.text) - marketScore(a.text))[0] ?? null };
}
const kstDay = (iso) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
/** Wire edition tags such as (종합) are not part of what the report says. */
const wireHeadline = (title) => title.replace(/\s*\((?:종합|\d+보)[^)]*\)\s*$/, '').trim();
const wireSource = (report) => ({ label: `${report.publisher} 「${report.title}」 (${koreanDateLabel(kstDay(report.publishedAt))})`, url: report.url, kind: 'article' });
/** Fallback core commentary: news-wire close reports, quoted with publisher and date, used only when no broker brief explains the session. */
function wireCause(reports, key, sources) {
    if (!reports.length)
        return null;
    const paragraphs = reports.map(report => ({ text: report.sentence ? `${josa(report.publisher, '은', '는')} ${koreanDateLabel(kstDay(report.publishedAt))} 마감 기사 「${report.title}」에서 ${said([quote(report.sentence)])} 전했다.` : `${josa(report.publisher, '은', '는')} ${koreanDateLabel(kstDay(report.publishedAt))} 마감 기사에서 ${said([quote(wireHeadline(report.title))])} 전했다.`, source: wireSource(report) }));
    for (const report of reports)
        sources.push({ label: `${report.publisher} 「${report.title}」 (${kstDay(report.publishedAt)})`, url: report.url, publisher: report.publisher, date: kstDay(report.publishedAt) });
    const first = reports[0];
    return { section: { key, placement: 'early', title: '상승·하락 요인', intro: '증권사 아침 리포트 게시 전이어서 통신사 마감 기사를 인용했다.', paragraphs }, lead: `${josa(first.publisher, '은', '는')} 이날 장을 ${said([quote(first.sentence ?? wireHeadline(first.title))])} 전했다.` };
}
function riskParagraphs(briefs, region, checkpoint) {
    const events = [...new Map(briefs.flatMap(brief => (brief.events ?? []).filter(item => item.region === region).map(item => [item.text, { item, brief }]))).values()].slice(0, 4);
    const paragraphs = events.map(({ item, brief }) => ({ text: `예정 일정(${brief.report.broker} 집계): ${item.text}`, source: reportSource(brief.report) }));
    paragraphs.push({ text: checkpoint });
    return paragraphs;
}
export function composeUSDeepSections(input) {
    const sections = [], sources = [], leadAddition = [];
    const briefs = input.bundle?.briefs ?? [];
    const cause = causeParagraphs(briefs, 'US');
    const wire = cause.first ? null : wireCause(input.wire ?? [], 'us-causes', sources);
    if (cause.first) {
        sections.push({ key: 'us-causes', placement: 'early', title: '상승·하락 요인과 반대 시각', paragraphs: cause.paragraphs });
    }
    else if (wire) {
        sections.push(wire.section);
    }
    // Big moves among the largest companies lead (largest first), then the most-searched names.
    const big = [...input.stocks].filter(stock => stock.bigMover).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 2);
    const ranked = [...big, ...[...input.stocks].filter(stock => !big.includes(stock)).sort((a, b) => (a.trendingRank ?? 99) - (b.trendingRank ?? 99) || (a.mostActiveRank ?? 99) - (b.mostActiveRank ?? 99))].slice(0, 6);
    let titleFocus = null;
    const market = [];
    if (input.sectors.length >= 6) {
        const best = input.sectors[0], worst = input.sectors.at(-1), up = input.sectors.filter(item => item.changePct > 0.005).length;
        const scope = input.sectors.length === 11 ? '11종' : `11종 중 종가가 확인된 ${input.sectors.length}종`;
        market.push({ text: `S&P 500 업종을 추종하는 SPDR 업종 ETF ${scope} 가운데 ${up}종이 올랐다. ${best.label}(${best.symbol}) ${signedPct(best.changePct)}가 가장 강했고 ${worst.label}(${worst.symbol}) ${signedPct(worst.changePct)}가 가장 약했다${input.sectors.length === 11 ? '' : '(확인된 업종 기준)'}. 업종별 등락: ${input.sectors.map(item => `${item.label} ${signedPct(item.changePct)}`).join(', ')}.` });
    }
    if (ranked.length) {
        const mentions = (stock) => {
            // A ticker counts only as a whole token (C must not match the C in FOMC); a Korean company name counts as written.
            const ticker = stock.symbol.length >= 2 ? new RegExp(`(?<![A-Za-z])${stock.symbol.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&')}(?![A-Za-z])`) : null;
            return briefs.flatMap(brief => brief.statements.filter(item => item.region === 'US' && (Boolean(stock.koreanName && stock.koreanName.length >= 2 && item.text.includes(stock.koreanName)) || Boolean(ticker?.test(item.text)))).map(item => ({ item, brief })))[0];
        };
        for (const stock of ranked) {
            const name = displayName(stock), particle = josa(name, '은', '는').slice(name.length), linked = mentions(stock);
            const rank = [stock.bigMover ? '시가총액 상위 종목' : '', stock.trendingRank ? `야후 파이낸스 검색 ${stock.trendingRank}위` : '', stock.mostActiveRank ? `대형주 거래량 ${stock.mostActiveRank}위` : ''].filter(Boolean).join(', ');
            market.push({ text: `${name}(${stock.symbol})${particle} ${usd(stock.close)}달러로 ${absPct(stock.changePct)} ${moveWord(stock.changePct)}했다${rank ? `(${rank})` : ''}.${linked ? ` ${josa(linked.brief.report.broker, '은', '는')} ${said([quote(linked.item.text)])} 설명했다.` : ''}`, ...(linked ? { source: reportSource(linked.brief.report) } : {}) });
        }
        // Titles use Korean company names only (the headline policy holds English names in titles).
        // The headline names the day's biggest megacap move when there is one, else the first searched name that moved 3%+.
        const named = ranked.filter(stock => stock.koreanName), focus = named.find(stock => stock.bigMover) ?? named.find(stock => Math.abs(stock.changePct) >= 3) ?? named[0];
        if (focus)
            titleFocus = `${displayName(focus)} ${Math.abs(focus.changePct).toFixed(Math.abs(focus.changePct) >= 10 ? 0 : 1)}% ${moveWord(focus.changePct)}`;
    }
    if (market.length)
        sections.push({ key: 'us-sectors-stocks', placement: 'early', title: '업종과 종목', intro: '종목 순위는 투자자 관심도를 보여 줄 뿐 주가 변동의 원인을 뜻하지 않는다. 등락은 해당 거래일 종가 기준이다.', paragraphs: market });
    const rateDigests = briefs.flatMap(brief => brief.digests.filter(item => /FOMC|연준|Fed|美|미국|달러/.test(item.heading) && !/프랑스|유럽|ECB|중국|일본|독일|영국|국고채|코스피|KOSPI|하이닉스|퀀틴전시|국내/.test(item.heading)).map(item => ({ item, brief }))).slice(0, 2);
    const economy = (input.bundle?.economy ?? []).filter(item => /FOMC|연준|금리|미국|美|달러|물가|고용|Fed/.test(item.title)).slice(0, 3);
    if (rateDigests.length || economy.length)
        sections.push({ key: 'us-broker-analysis', placement: 'late', title: '증권사별 분석: 금리와 통화정책', paragraphs: [...rateDigests.map(({ item, brief }) => digestParagraph(item, brief)), ...economy.map(report => ({ text: ratingSentence(report), source: reportSource(report) }))] });
    if (input.checkpoint && sections.length)
        sections.push({ key: 'us-risks', placement: 'risks', title: '위험 요인과 다음 확인 지표', paragraphs: riskParagraphs(briefs, 'US', input.checkpoint) });
    const used = new Set(sections.flatMap(section => section.paragraphs.map(p => p.source?.url).filter(Boolean)));
    for (const report of [...briefs.map(item => item.report), ...economy])
        if (used.has(report.url))
            sources.push(sourceEntry(report));
    return { sections, leadAddition, titleFocus, sources: [...new Map(sources.map(item => [item.url, item])).values()], hasCoreCommentary: Boolean(cause.first || wire) };
}
export function composeKoreaDeepSections(input) {
    const sections = [], sources = [], leadAddition = [];
    const briefs = input.bundle?.briefs ?? [], companyReports = input.bundle?.company ?? [];
    const cause = causeParagraphs(briefs, 'KOREA');
    const wire = cause.first ? null : wireCause(input.wire ?? [], 'korea-causes', sources);
    if (cause.first) {
        sections.push({ key: 'korea-causes', placement: 'early', title: '상승·하락 요인과 반대 시각', paragraphs: cause.paragraphs });
    }
    else if (wire) {
        sections.push(wire.section);
    }
    const digests = briefs.flatMap(brief => brief.digests.map(item => ({ item, brief })));
    const companyDigest = (name) => digests.find(({ item }) => item.heading.replace(/\s+/g, '').includes(name.replace(/\s+/g, '')));
    let titleFocus = null;
    if (input.searchTop.length) {
        // Why the stock moved: a broker comment on the session that names it, quoted with the broker; then the latest rating.
        const why = (name) => briefs.flatMap(brief => brief.statements.filter(item => item.region === 'KOREA' && item.text.length <= 200 && item.text.replace(/\s+/g, '').includes(name.replace(/\s+/g, ''))).map(item => ({ item, brief })))[0];
        // One link per paragraph: the move with its reason (broker comment) and the rating (company report) are cited separately.
        const paragraphs = input.searchTop.flatMap(stock => {
            const report = companyReports.find(item => item.stockCode === stock.code), digest = companyDigest(stock.name), reason = why(stock.name);
            const head = `검색 ${stock.rank}위 ${josa(stock.name, '은', '는')} ${won(stock.close)}원으로 ${absPct(stock.changePct)} ${moveWord(stock.changePct)}했다.`;
            const out = [];
            if (reason)
                out.push({ text: `${head} ${josa(reason.brief.report.broker, '은', '는')} ${koreanDateLabel(reason.brief.report.date)} 「${reason.brief.report.title}」에서 ${said([quote(reason.item.text)])} 짚었다.`, source: reportSource(reason.brief.report) });
            const research = report ? { text: ratingSentence(report), source: reportSource(report) } : digest && !reason ? { text: digestParagraph(digest.item, digest.brief, 2).text, source: reportSource(digest.brief.report) } : null;
            if (!reason)
                out.push(research ? { text: `${head} ${research.text}`, source: research.source } : { text: head });
            else if (research)
                out.push(research);
            return out;
        });
        sections.push({ key: 'korea-stocks', placement: 'early', title: '업종과 종목: 투자자 검색 상위', intro: '네이버페이 증권 검색 상위 종목(ETF·ETN·레버리지 제외)의 전일 종가 기준 등락과 최근 증권사 리포트다. 검색 순위는 관심도 지표이며 주가 변동의 원인이 아니다.', paragraphs });
        const top = input.searchTop[0];
        titleFocus = `검색 ${top.rank}위 ${top.name} ${Math.abs(top.changePct).toFixed(1)}% ${moveWord(top.changePct)}`;
    }
    const shown = new Set(input.searchTop.map(item => item.code));
    const reviewDigests = digests.filter(({ item }) => /Review|Preview|실적|목표주가|리뷰/.test(item.heading) && !input.searchTop.some(stock => item.heading.replace(/\s+/g, '').includes(stock.name.replace(/\s+/g, '')))).slice(0, 3);
    const otherReports = [...new Map(companyReports.filter(item => item.stockCode && !shown.has(item.stockCode) && (item.targetPrice || item.rating)).map(item => [item.stockCode, item])).values()].slice(0, 4);
    const strategy = digests.filter(({ item }) => /전략|퀀틴전시|Strategy|시황|증시|KOSPI|코스피/.test(item.heading)).slice(0, 1);
    const industry = (input.bundle?.industry ?? []).filter(item => !/daily|데일리|weekly|위클리|안녕하세요/i.test(item.title)).slice(0, 3);
    const analysis = [...strategy.map(({ item, brief }) => digestParagraph(item, brief, 2)), ...reviewDigests.map(({ item, brief }) => digestParagraph(item, brief, 2)), ...otherReports.map(report => ({ text: `${report.company}: ${ratingSentence(report)}`, source: reportSource(report) })), ...(industry.length ? [{ text: `최근 산업 리포트: ${industry.map(report => `${report.broker} 「${report.title}」(${koreanDateLabel(report.date)})`).join(', ')}.`, source: reportSource(industry[0]) }] : [])];
    if (analysis.length)
        sections.push({ key: 'korea-broker-analysis', placement: 'late', title: '증권사별 분석', intro: '투자의견과 목표주가는 각 증권사가 리포트에 게시한 값이며, 증권사마다 전제와 시점이 다르다.', paragraphs: analysis });
    if (input.checkpoint && sections.length)
        sections.push({ key: 'korea-risks', placement: 'risks', title: '위험 요인과 다음 확인 지표', paragraphs: riskParagraphs(briefs, 'KOREA', input.checkpoint) });
    const used = new Set(sections.flatMap(section => section.paragraphs.map(p => p.source?.url).filter(Boolean)));
    for (const report of [...briefs.map(item => item.report), ...companyReports, ...industry])
        if (used.has(report.url))
            sources.push(sourceEntry(report));
    return { sections, leadAddition, titleFocus, sources: [...new Map(sources.map(item => [item.url, item])).values()], hasCoreCommentary: Boolean(cause.first || wire) };
}
const AI_WORDS = /AI|인공지능|반도체|HBM|데이터센터|GPU|엔비디아|LLM|클라우드|전력기기|인터커넥트|로봇|휴머노이드|파운드리|메모리|서버|MLCC|FC ?BGA/;
/** AI article: AI bellwether moves on the latest U.S. session and broker research that names AI demand. */
const AI_ISSUE = /AI|인공지능|빅테크|알파벳|구글|마이크로소프트|\bMS\b|아마존|AWS|애저|Azure|메타(?!버스)|엔비디아|오라클|데이터센터|클라우드|설비투자|CapEx|반도체|HBM|GPU/;
/** AI article: the day's AI issue as brokers explained the latest U.S. session, AI bellwether moves and AI research. */
export function composeAIDeepSections(input) {
    const sections = [], sources = [], leadAddition = [];
    // The day's AI issue: broker morning comments on the U.S. session that name AI companies or AI investment.
    const issueBriefs = (input.bundle?.briefs ?? []).map(brief => ({ ...brief, statements: brief.statements.filter(item => item.region === 'US' && AI_ISSUE.test(item.text)) })).filter(brief => brief.statements.length);
    const issue = causeParagraphs(issueBriefs, 'US');
    let titleFocus = null;
    if (issue.first) {
        sections.push({ key: 'ai-issue', placement: 'early', title: '오늘의 AI 쟁점: 증권가 시각', intro: '직전 미국 정규장에서 AI 관련 기업의 주가를 움직인 사안을 증권사 아침 리포트 원문으로 정리했다.', paragraphs: issue.paragraphs });
        // The headline names the AI bellwether with the largest move that the brokers themselves discussed.
        // Only a stock whose move is printed in the stock section and whose name appears in a quoted paragraph qualifies.
        const quoted = issue.paragraphs.map(p => p.text).join('\n'), mentions = (name) => new RegExp(`${name}(?!버스)`).test(quoted);
        const named = input.stocks.length >= 3 && input.sessionDate ? [...input.stocks].filter(stock => stock.koreanName && Math.abs(stock.changePct) >= 3 && mentions(stock.koreanName)).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0] : undefined;
        if (named) {
            titleFocus = `${named.koreanName} ${Math.abs(named.changePct).toFixed(Math.abs(named.changePct) >= 10 ? 0 : 1)}% ${moveWord(named.changePct)}`;
            leadAddition.push(`직전 미국 정규장(${koreanDateLabel(input.sessionDate)})에서 ${named.koreanName}(${named.symbol})${josa(named.koreanName, '은', '는').slice(named.koreanName.length)} ${absPct(named.changePct)} ${moveWord(named.changePct)}했다.`);
        }
    }
    if (input.stocks.length >= 3 && input.sessionDate) {
        const sorted = [...input.stocks].sort((a, b) => b.changePct - a.changePct), best = sorted[0], worst = sorted.at(-1);
        const up = sorted.filter(item => item.changePct > 0.005).length;
        sections.push({ key: 'ai-stocks', placement: 'early', title: 'AI 대표 종목의 주가 흐름', intro: `미국 AI 대표 종목 ${sorted.length}개의 직전 정규장(${input.sessionDate}) 종가 기준 등락이다.`, paragraphs: [
                { text: `${sorted.length}개 종목 가운데 ${up}개가 올랐다. 가장 강한 종목은 ${displayName(best)}(${best.symbol}, ${signedPct(best.changePct)}), 가장 약한 종목은 ${displayName(worst)}(${worst.symbol}, ${signedPct(worst.changePct)})${josa(displayName(worst), '이었다', '였다').slice(displayName(worst).length)}.` },
                { text: sorted.map(item => `${displayName(item)} ${signedPct(item.changePct)}`).join(' · ') },
            ] });
    }
    const briefs = input.bundle?.briefs ?? [];
    const digests = briefs.flatMap(brief => brief.digests.filter(item => AI_WORDS.test(item.heading) || item.bullets.some(bullet => AI_WORDS.test(bullet))).map(item => ({ item, brief }))).slice(0, 3);
    const companies = [...new Map((input.bundle?.company ?? []).filter(item => AI_WORDS.test(item.title) && (item.rating || item.targetPrice)).map(item => [item.stockCode ?? item.url, item])).values()].slice(0, 4);
    const industry = (input.bundle?.industry ?? []).filter(item => AI_WORDS.test(item.title) && !/daily|데일리|weekly|위클리/i.test(item.title)).slice(0, 3);
    if (digests.length || companies.length || industry.length) {
        sections.push({ key: 'ai-broker-research', title: '증권가가 본 AI 산업', intro: '국내 증권사가 최근 공개한 리포트 가운데 AI 수요를 직접 다룬 분석의 문장과 투자의견을 그대로 옮겼다.', paragraphs: [
                ...digests.map(({ item, brief }) => digestParagraph(item, brief)),
                ...companies.map(report => ({ text: `${report.company ?? report.title}: ${ratingSentence(report)}`, source: reportSource(report) })),
                ...industry.map(report => ({ text: `${subject(report)} ${koreanDateLabel(report.date)} 「${report.title}」 산업 리포트를 냈다.${report.summary.length ? ` 요약: ${report.summary.slice(0, 2).map(quote).join(', ')}.` : ''}`, source: reportSource(report) })),
            ] });
    }
    const used = new Set(sections.flatMap(section => section.paragraphs.map(p => p.source?.url).filter(Boolean)));
    for (const report of [...briefs.map(item => item.report), ...companies, ...industry])
        if (used.has(report.url))
            sources.push(sourceEntry(report));
    return { sections, leadAddition, titleFocus, hasCoreCommentary: Boolean(issue.first), sources: [...new Map(sources.map(item => [item.url, item])).values()] };
}
export { indexMove };
