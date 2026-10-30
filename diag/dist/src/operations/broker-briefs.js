/**
 * Korean broker research intake from Naver Pay Securities' research board and Hankyung Consensus
 * (consensus.hankyung.com), public aggregators of broker reports. Daily market briefs, company, industry and economy reports are listed with title, broker,
 * analyst, date, and (for companies) the published target price and rating; each report is a public PDF.
 *
 * Content rules:
 * - Only statements printed by the broker are used, quoted verbatim and attributed (broker, analyst/team, date,
 *   report title, PDF link). Nothing is paraphrased, translated, or invented, and no rating/target is inferred.
 * - A brief's market commentary is used only for the session it describes: the first brief date after the
 *   session, and a Korean brief whose KOSPI level contradicts the verified close is discarded.
 * - Only single-line printed bullets are quoted, so PDF line wrapping can never corrupt a quotation.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMarketComment, listNaverResearch, naverReport, naverResearchDetail, naverResearchListUrl, reportKey, summaryAsBullets, titleDates } from './naver-research.js';
export const CONSENSUS_HOST = 'https://consensus.hankyung.com';
const LIST = { MARKET: 'skinType=market&report_type=MK', COMPANY: 'skinType=business&report_type=CO', INDUSTRY: 'skinType=industry&report_type=IN', ECONOMY: 'report_type=EC' };
const UA = 'Mozilla/5.0 (compatible; MOTUS-ResearchCollector/1.0; +https://motusnova.blogspot.com)';
export function consensusListUrl(kind, from, to) { return `${CONSENSUS_HOST}/analysis/list?${LIST[kind]}&sdate=${from}&edate=${to}&now_page=1&pagenum=80`; }
export function consensusPdfUrl(idx) { return `${CONSENSUS_HOST}/analysis/downpdf?report_idx=${idx}`; }
function clean(value) { return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
const BROKER = /(?:증권|투자증권|금융투자|은행|리서치|자산운용|Securities|SECURITIES)$/;
const RATING = /^(?:Strong Buy|Buy|BUY|Trading Buy|Outperform|Overweight|Marketperform|Hold|HOLD|Neutral|중립|매수|적극매수|비중확대|Not Rated|NR|Sell|매도|보유)(?:\s*\([^)]*\))?$/i;
/** Parses any Hankyung consensus list skin: columns are located by content rather than position. */
export function parseConsensusList(html, kind) {
    const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);
    const reports = [];
    for (const row of rows) {
        const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
        if (cells.length < 4)
            continue;
        const date = clean(cells[0]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            continue;
        const titleCell = cells.find(cell => /report_idx=\d+/.test(cell) && /layerPop|<strong>/.test(cell)) ?? cells.find(cell => /report_idx=\d+/.test(cell));
        if (!titleCell)
            continue;
        const idx = titleCell.match(/report_idx=(\d+)/)[1];
        const title = clean(titleCell.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] ?? titleCell.replace(/<div class="layerPop">[\s\S]*$/, ''));
        const summary = [...titleCell.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map(match => clean(match[1])).filter(item => item && !title.includes(item) && item.length >= 8);
        const texts = cells.map(cell => clean(cell.replace(/<div class="layerPop">[\s\S]*?<\/div>\s*<\/div>/g, '')));
        const brokerIndex = texts.findIndex((text, index) => index > 0 && BROKER.test(text));
        if (brokerIndex < 0)
            continue;
        const broker = texts[brokerIndex], analysts = texts[brokerIndex - 1] ?? '';
        const target = texts.find(text => /^\d{1,3}(?:,\d{3})+$|^\d{4,}$/.test(text)) ?? null, rating = texts.find(text => RATING.test(text)) ?? null;
        const company = title.match(/^(.+?)\((\d{6})\)/);
        reports.push({ kind, date, title, broker, analysts: analysts && !/^-$/.test(analysts) ? analysts : '', url: consensusPdfUrl(idx), summary, targetPrice: target, rating, stockCode: company?.[2] ?? null, company: company?.[1]?.trim() ?? null });
    }
    return reports;
}
const MARKER = /^(?:[-•ㆍ·▪]\s*)(.+)$/;
const REGION_HEADING = [[/^\[\s*(?:미국|뉴욕)\s*증시\s*동향\s*\]$/, 'US'], [/^\[\s*(?:국내|한국)\s*증시\s*동향\s*\]$/, 'KOREA'], [/^\[[^\]]*(?:중국|유럽|일본|아시아|신흥국|FICC|외환|원자재)[^\]]*\]$/, 'OTHER'], [/^(?:▶\s*)?(?:미국|미국증시|미국 증시|뉴욕|뉴욕증시|\[\s*미국증시\s*\]|\[\s*해외증시\s*\]|Global Market)$/, 'US'], [/^(?:▶\s*)?(?:한국증시|국내|국내증시|한국|\[\s*국내증시\s*\]|\[\s*한국증시\s*\])$/, 'KOREA'], [/^(?:▶\s*)?(?:중국|중국증시|유럽|유럽증시|일본|아시아|신흥국)$/i, 'OTHER']];
const EVENT_HEADING = /Event|일정|캘린더|Calendar|Schedule/i;
const US_WORDS = /미국|뉴욕|美|미 증시|S&P|나스닥|다우|연준|FOMC|빅테크|필라델피아|월가|Fed/;
const KOREA_WORDS = /코스피|KOSPI|코스닥|KOSDAQ|국내 증시|국내증시|양대 지수|사이드카|외국인과 기관|유가증권시장/;
const ANALYST_LINE = /^([가-힣]{2,4}(?:[,·][가-힣]{2,4})*)\s*\.\s*\S+@\S+$/;
const CATEGORY_LINE = /^(?:[A-Za-z][A-Za-z &/]{2,30}|산업 및 종목 분석|기업분석|산업분석|투자전략|시황|경제|채권)$/;
function hangul(value) { return (value.match(/[가-힣]/g) ?? []).length; }
function quotable(value) { return value.length >= 18 && value.length <= 200 && hangul(value) >= 8 && !/@|https?:|\.com\b/.test(value) && (value.match(/\d/g) ?? []).length <= value.length * 0.3; }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SENTENCE_END = /(?:다|함|음|임|됨|마감|전망|예상|지속|필요|유지|상승|하락|강세|약세|확대|축소|전환|발동|기록|주목|부각|반등|급등|급락|우려|기대|\)|%)\.?$/;
/** Extracts verbatim single-line bullets, region headlines and titled bullet digests from a broker brief's text. */
export function extractBriefContent(text, defaultRegion = null) {
    const lines = text.split(/\r?\n/).map(line => line.replace(/\u00a0/g, ' ').trim());
    const statements = [], digests = [], events = [];
    let eventMode = false;
    let region = null, pendingHeadline = null, digest = null;
    const flush = () => { if (digest && digest.bullets.length)
        digests.push(digest); digest = null; };
    // An unmarked Korean line right after a quoted line may be its continuation; such a line is never quoted.
    const continues = (next) => Boolean(next) && !MARKER.test(next) && !ANALYST_LINE.test(next) && !CATEGORY_LINE.test(next) && !EVENT_HEADING.test(next) && !/^(?:▶|■|\[)/.test(next) && hangul(next) >= 2 && !REGION_HEADING.some(([pattern]) => pattern.test(next));
    const previousNonEmpty = (index) => { for (let j = index - 1; j >= 0; j--)
        if (lines[j])
            return { line: lines[j], gap: j < index - 1 }; return { line: '', gap: true }; };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) {
            if (eventMode && !(lines[i + 1] ?? '').match(MARKER))
                eventMode = false;
            continue;
        }
        if (/^(?:▶|■)?\s*\S.*$/.test(line) && EVENT_HEADING.test(line) && line.length <= 40 && !MARKER.test(line)) {
            eventMode = true;
            region = null;
            pendingHeadline = null;
            flush();
            continue;
        }
        const heading = REGION_HEADING.find(([pattern]) => pattern.test(line));
        if (heading) {
            eventMode = false;
            region = heading[1];
            pendingHeadline = heading[1] === 'OTHER' ? null : heading[1];
            flush();
            continue;
        }
        if (/^(?:▶|■)/.test(line) || /^\[[^\]]{1,24}\]$/.test(line)) {
            eventMode = false;
            region = null;
            pendingHeadline = null;
            flush();
            continue;
        }
        const analyst = line.match(ANALYST_LINE);
        if (analyst) {
            eventMode = false;
            if (digest)
                digest.analyst = analyst[1];
            flush();
            continue;
        }
        if (CATEGORY_LINE.test(line)) {
            eventMode = false;
            flush();
            region = null;
            pendingHeadline = null;
            continue;
        }
        const bullet = line.match(MARKER);
        if (bullet) {
            pendingHeadline = null;
            const body = bullet[1].trim(), next = lines[i + 1] ?? '';
            if (eventMode) {
                const item = body.replace(/^(?:미|美)\s*-\s*/, '미국: ').replace(/^(?:한|국내)\s*-\s*/, '국내: ');
                if (item.length >= 6 && item.length <= 120 && hangul(item) >= 2)
                    events.push({ region: /^미국:|美|미국|FOMC|연준/.test(item) ? 'US' : 'KOREA', text: item });
                continue;
            }
            // A following unmarked prose line means the printed bullet wrapped; skip it rather than guess the join.
            // Any following unmarked Korean line may be the rest of this bullet; a plausible-looking ending never overrides that.
            const wrapped = continues(next);
            if (wrapped || !quotable(body) || region === 'OTHER')
                continue;
            if (digest)
                digest.bullets.push(body);
            // Bullets inside a titled report digest count as market commentary only when the report itself is a market/rates piece.
            if (digest && !/FOMC|연준|금리|증시|시황|전략|퀀틴전시|Strategy|코스피|KOSPI|美|미국|뉴욕/.test(digest.heading))
                continue;
            // A bullet that names neither market belongs to the brief's own market when the brief covers only one (a Korean closing comment).
            const classified = region ?? (KOREA_WORDS.test(body) && !/미국|뉴욕|美/.test(body) ? 'KOREA' : US_WORDS.test(body) && !KOREA_WORDS.test(body) ? 'US' : defaultRegion && !(defaultRegion === 'KOREA' ? US_WORDS : KOREA_WORDS).test(body) ? defaultRegion : null);
            if (classified)
                statements.push({ region: classified, text: body, heading: digest?.heading ?? null });
            continue;
        }
        if (pendingHeadline && quotable(line) && !continues(lines[i + 1] ?? '') && /(?:마감|상승|하락|강세|약세|반등|급등|급락|혼조|보합)$/.test(line)) {
            statements.push({ region: pendingHeadline, text: line, heading: null });
            pendingHeadline = null;
            continue;
        }
        // A digest heading is a short title line that starts a block (after a blank, category, analyst or another block)
        // and is immediately followed by bullets; wrapped sentence fragments never qualify.
        const prior = previousNonEmpty(i), next = lines[i + 1] ?? '';
        if (hangul(line) >= 4 && line.length <= 80 && MARKER.test(next) && (prior.gap || ANALYST_LINE.test(prior.line) || CATEGORY_LINE.test(prior.line) || !prior.line)) {
            eventMode = false;
            flush();
            digest = { heading: line, bullets: [], analyst: null };
            region = region === 'OTHER' ? null : region;
            continue;
        }
    }
    flush();
    return { statements: [...new Map(statements.map(item => [item.region + item.text, item])).values()], digests, events: [...new Map(events.map(item => [item.text, item])).values()] };
}
/** A Korea brief that prints a KOSPI level different from the verified close describes another session. */
export function contradictsKospi(statements, verifiedClose) {
    for (const item of statements.filter(entry => entry.region === 'KOREA' && /코스피|KOSPI/i.test(entry.text))) {
        // Only a level printed right after the KOSPI name is compared (a KOSDAQ level in the same bullet is not KOSPI).
        for (const mention of item.text.matchAll(/KOSPI|코스피/gi)) {
            const rest = item.text.slice(mention.index + mention[0].length), stop = rest.search(/KOSDAQ|코스닥|KOSPI|코스피/i), scope = (stop >= 0 ? rest.slice(0, stop) : rest).slice(0, 60), match = scope.match(/(\d{1,2},\d{3}(?:\.\d+)?)/);
            if (!match)
                continue;
            // A round level ('6,000선') or an intraday print ('6,100p 터치', '회복', '하회') is not the close.
            const after = scope.slice(scope.indexOf(match[1]) + match[1].length, scope.indexOf(match[1]) + match[1].length + 14);
            if (/^\s*선|^\s*(?:p|pt|P)?\s*(?:대|터치|돌파|회복|하회|상회|탈환|이탈|부근|근처)/.test(after) || /장중|터치|고점|저점/.test(scope))
                continue;
            const value = Number(match[1].replace(/,/g, ''));
            if (value > 1000 && Math.abs(value - verifiedClose) / verifiedClose > 0.002)
                return true;
        }
    }
    return false;
}
export const pdftotextReader = async (pdf) => {
    const dir = await mkdtemp(join(tmpdir(), 'motus-pdf-'));
    try {
        const file = join(dir, 'report.pdf');
        await writeFile(file, pdf);
        return await new Promise(resolve => execFile('pdftotext', ['-l', '3', '-enc', 'UTF-8', file, '-'], { timeout: 20000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : String(stdout))));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
};
function addDays(date, days) { return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
async function getText(fetcher, url) {
    const response = await fetcher(url, { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'ko-KR,ko;q=0.9', referer: CONSENSUS_HOST + '/analysis/list' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok)
        throw new Error('CONSENSUS_HTTP_' + response.status);
    return await response.text();
}
/** Complete, quotable sentences of a broker summary (analysis may look ahead, so outlook lines are kept here). */
export function summarySentences(html) {
    return summaryAsBullets(html).split('\n').map(line => line.replace(/^[-•ㆍ·▪]\s*/, '').trim()).filter(line => quotable(line) && line.length <= 150 && /(?:다|음|함|임|됨)\.?$|(?:전망|예상|필요|지속|확대|축소|강세|약세|상승|하락)$/.test(line));
}
/** Forward-looking lines (today's outlook, scheduled items) describe no finished session. */
const OUTLOOK = /금일|오늘|전망입니다|전망이다|할 전망|출발할|예정|것으로 (?:판단|예상|보인다|보임)|예상됩니다/;
/**
 * Collects broker research for one market session. `sessionDate` is the trading date the article covers;
 * briefs dated on the first available day after it carry that session's commentary, and a closing comment
 * published on the session's own evening ('마감', '레이더') carries the Korean session only.
 * Naver Pay Securities' research board lists the brokers' morning comments within minutes; Hankyung Consensus
 * is read as well and the two are de-duplicated per report.
 */
export async function collectBrokerResearch(input) {
    const fetcher = input.fetcher ?? fetch, pdfText = input.pdfText ?? pdftotextReader, audit = [];
    const from = addDays(input.sessionDate, -6), to = addDays(input.operationDate, 1);
    const lists = {};
    const naverLists = {};
    await Promise.all([
        ...['MARKET', 'COMPANY', 'INDUSTRY', 'ECONOMY'].map(async (kind) => {
            const url = consensusListUrl(kind, from, to);
            try {
                const reports = parseConsensusList(await getText(fetcher, url), kind).filter(item => item.date <= input.operationDate);
                lists[kind] = reports;
                audit.push({ sourceId: 'consensus:list:' + kind.toLowerCase(), url, status: 'PASS', count: reports.length, error: null });
            }
            catch (error) {
                lists[kind] = [];
                audit.push({ sourceId: 'consensus:list:' + kind.toLowerCase(), url, status: 'FAILED', count: 0, error: error instanceof Error && /^CONSENSUS_HTTP_\d{3}$/.test(error.message) ? error.message : 'CONSENSUS_FETCH_FAILED' });
            }
        }),
        ...['market', 'invest', 'economy', 'industry', 'company'].map(async (category) => {
            const url = naverResearchListUrl(category);
            try {
                const items = (await listNaverResearch(fetcher, category)).filter(item => item.writeDate <= input.operationDate && item.writeDate >= from);
                naverLists[category] = items;
                audit.push({ sourceId: 'naver-research:list:' + category, url, status: 'PASS', count: items.length, error: null });
            }
            catch (error) {
                naverLists[category] = [];
                audit.push({ sourceId: 'naver-research:list:' + category, url, status: 'FAILED', count: 0, error: error instanceof Error && /^NAVER_RESEARCH_HTTP_\d{3}$/.test(error.message) ? error.message : 'NAVER_RESEARCH_FETCH_FAILED' });
            }
        }),
    ]);
    // A date printed in the title must be the session or the report's own date (a 10/28 close note listed on 10/29 is not about 10/29).
    const datedFor = (report, allowed) => { const printed = titleDates(report.title, report.date); return !printed.length || printed.some(date => allowed.includes(date)); };
    /**
     * A Korean closing comment describes the Korean session; the U.S. lines in it are the previous U.S. night.
     * It is recognised by a title dated on the session but listed later, or by '마감'/'레이더' in a title that is
     * neither about U.S./global markets nor dated on its own listing day (a morning '美 증시 마감' note is not one).
     */
    const closingComment = (report) => { const printed = titleDates(report.title, report.date); return (printed.includes(input.sessionDate) && report.date > input.sessionDate) || (/마감|레이더/.test(report.title) && !/美|미국|뉴욕|해외|글로벌|Global/i.test(report.title) && !printed.includes(report.date)) || (report.date === input.sessionDate && /마감|레이더/.test(report.title)); };
    const pool = [
        ...['market', 'invest', 'economy'].flatMap(category => (naverLists[category] ?? []).filter(isMarketComment).map(item => ({ report: naverReport(item, 'MARKET', null, category), naver: { item, category }, koreaOnly: false }))),
        ...(lists.MARKET ?? []).filter(item => /brief|daily|market|아침|모닝|morning|start|wake|view|데일리|시황|마감|코멘트/i.test(item.title)).map(report => ({ report, koreaOnly: false })),
    ].map(item => ({ ...item, koreaOnly: closingComment(item.report) }));
    // Morning briefs published after the session describe it; take the earliest such date only.
    const after = pool.filter(item => item.report.date > input.sessionDate && item.report.date <= addDays(input.sessionDate, 5));
    const briefDate = after.map(item => item.report.date).sort()[0];
    const sameEvening = pool.filter(item => item.report.date === input.sessionDate && /마감|레이더/.test(item.report.title));
    const ordered = [...after.filter(item => item.report.date === briefDate), ...sameEvening].filter(item => datedFor(item.report, item.koreaOnly ? [input.sessionDate] : [input.sessionDate, item.report.date]));
    const candidates = [];
    const seen = new Set();
    for (const item of ordered) {
        const key = reportKey(item.report);
        if (seen.has(key))
            continue;
        seen.add(key);
        candidates.push(item);
    }
    const briefs = [];
    let attempts = 0;
    for (const candidate of candidates) {
        // Failed candidates count too, so a slow PDF host cannot stretch the run.
        if (briefs.length >= (input.maxBriefs ?? 8) || attempts >= (input.maxBriefs ?? 8) * 2)
            break;
        attempts++;
        let report = candidate.report;
        try {
            let statements = [], digests = [], events = [];
            const merge = (content, outlookFree) => {
                statements = [...new Map([...statements, ...content.statements.filter(item => !outlookFree || !OUTLOOK.test(item.text))].map(item => [item.region + item.text, item])).values()];
                digests = [...digests, ...content.digests.filter(digest => !digests.some(existing => existing.heading === digest.heading))];
                events = [...new Map([...events, ...content.events].map(item => [item.text, item])).values()];
            };
            if (candidate.naver) {
                const detail = await naverResearchDetail(fetcher, candidate.naver.category, candidate.naver.item.researchId);
                report = naverReport(candidate.naver.item, 'MARKET', detail, candidate.naver.category);
                if (detail.content)
                    merge(extractBriefContent(summaryAsBullets(detail.content), candidate.koreaOnly ? 'KOREA' : null), true);
            }
            const pdfUrl = candidate.naver ? (report.url.endsWith('.pdf') ? report.url : null) : report.url;
            if (pdfUrl) {
                try {
                    const response = await fetcher(pdfUrl, { headers: { 'user-agent': UA, ...(candidate.naver ? {} : { referer: CONSENSUS_HOST + '/analysis/list' }) }, signal: AbortSignal.timeout(candidate.naver ? 15000 : 25000) });
                    if (!response.ok)
                        throw new Error('CONSENSUS_HTTP_' + response.status);
                    const buffer = Buffer.from(await response.arrayBuffer());
                    if (buffer.subarray(0, 5).toString() !== '%PDF-')
                        throw new Error('CONSENSUS_NOT_PDF');
                    const text = await pdfText(buffer);
                    if (!text)
                        throw new Error('PDF_TEXT_UNAVAILABLE');
                    merge(extractBriefContent(text, candidate.koreaOnly ? 'KOREA' : null), Boolean(candidate.naver));
                }
                catch (error) {
                    if (!candidate.naver)
                        throw error;
                }
            }
            if (!statements.length && !digests.length && candidate.naver)
                throw new Error('NAVER_RESEARCH_EMPTY');
            if (candidate.koreaOnly) {
                statements = statements.filter(item => item.region === 'KOREA');
                digests = digests.filter(digest => !/美|미국|뉴욕|FOMC|연준|Fed|달러|국채|금리/.test(digest.heading));
                events = events.filter(item => item.region === 'KOREA');
            }
            const close = input.verifiedKospiClose;
            if (close) {
                const asStatements = (digest) => [digest.heading, ...digest.bullets].map(text => ({ region: 'KOREA', text, heading: null }));
                const mismatched = contradictsKospi(statements, close) || digests.some(digest => contradictsKospi(asStatements(digest), close));
                // A brief describing another session must not contribute any Korean market commentary, in statements or digests.
                if (mismatched) {
                    statements = statements.filter(item => item.region !== 'KOREA');
                    digests = digests.filter(digest => !/코스피|KOSPI|코스닥|KOSDAQ|국내 증시|국내증시|시황|전략|퀀틴전시/i.test([digest.heading, ...digest.bullets].join(' ')));
                }
            }
            briefs.push({ report, statements, digests, events });
            audit.push({ sourceId: (candidate.naver ? 'naver-research:' + candidate.naver.category + ':' : 'consensus:pdf:') + (candidate.naver ? candidate.naver.item.researchId : report.url.split('=').pop()), url: report.url, status: 'PASS', count: statements.length + digests.length, error: null, date: report.date });
        }
        catch (error) {
            audit.push({ sourceId: (candidate.naver ? 'naver-research:' + candidate.naver.category + ':' + candidate.naver.item.researchId : 'consensus:pdf:' + report.url.split('=').pop()), url: report.url, status: 'FAILED', count: 0, error: error instanceof Error && /^(?:CONSENSUS_HTTP_\d{3}|CONSENSUS_NOT_PDF|PDF_TEXT_UNAVAILABLE|NAVER_RESEARCH_HTTP_\d{3}|NAVER_RESEARCH_SHAPE|NAVER_RESEARCH_EMPTY)$/.test(error.message) ? error.message : 'BROKER_BRIEF_FAILED' });
        }
    }
    const recent = (items, days) => (items ?? []).filter(item => item.date <= input.operationDate && item.date >= addDays(input.sessionDate, -days));
    // Company reports: Naver details carry the published rating and target; focus stocks first, then the newest few.
    const focus = new Set(input.focusCodes ?? []);
    const companyItems = (naverLists.company ?? []).filter(item => item.writeDate >= addDays(input.sessionDate, -4));
    const wanted = [...companyItems.filter(item => item.itemCode && focus.has(item.itemCode)), ...companyItems.filter(item => !(item.itemCode && focus.has(item.itemCode))).slice(0, 8)].slice(0, 24);
    const naverCompany = (await Promise.all(wanted.map(async (item) => {
        try {
            const detail = await naverResearchDetail(fetcher, 'company', item.researchId);
            return naverReport(item, 'COMPANY', detail, 'company');
        }
        catch {
            return null;
        }
    }))).filter((item) => Boolean(item));
    const mergeReports = (items) => { const seenKeys = new Set(); return items.sort((a, b) => b.date.localeCompare(a.date)).filter(item => { const key = reportKey(item); if (seenKeys.has(key))
        return false; seenKeys.add(key); return true; }); };
    const naverPlain = (category, kind) => (naverLists[category] ?? []).map(item => naverReport(item, kind, null, category));
    // Economy reports: the broker's own summary gives the first two quotable sentences.
    const economyItems = (naverLists.economy ?? []).filter(item => item.writeDate >= addDays(input.sessionDate, -6)).slice(0, 6);
    const naverEconomy = (await Promise.all(economyItems.map(async (item) => {
        try {
            const detail = await naverResearchDetail(fetcher, 'economy', item.researchId);
            const report = naverReport(item, 'ECONOMY', detail, 'economy');
            report.summary = summarySentences(detail.content).slice(0, 2);
            return report;
        }
        catch {
            return naverReport(item, 'ECONOMY', null, 'economy');
        }
    })));
    return { briefs, company: mergeReports([...naverCompany, ...recent(lists.COMPANY, 4)]), industry: mergeReports([...recent(naverPlain('industry', 'INDUSTRY'), 4), ...recent(lists.INDUSTRY, 4)]), economy: mergeReports([...recent(naverEconomy, 6), ...recent(naverPlain('economy', 'ECONOMY'), 6), ...recent(lists.ECONOMY, 6)]), audit };
}
export function koreanDateLabel(date) { const [, month, day] = date.split('-'); return `${Number(month)}월 ${Number(day)}일`; }
export function analystLabel(report) {
    const names = report.analysts.trim();
    if (!names || /리서치센터|투자전략|팀|부$/.test(names))
        return `${report.broker}${names ? ' ' + names : ''}`;
    return `${report.broker} ${names.replace(/\s*,\s*/g, '·')} 연구원`;
}
