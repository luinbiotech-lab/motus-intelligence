export const WIRE_FEEDS = [
    { url: 'https://www.yna.co.kr/rss/news.xml', publisher: '연합뉴스' },
    { url: 'https://www.yna.co.kr/rss/market.xml', publisher: '연합뉴스' },
    { url: 'https://news.einfomax.co.kr/rss/allArticle.xml', publisher: '연합인포맥스' },
    { url: 'https://news.einfomax.co.kr/rss/S1N2.xml', publisher: '연합인포맥스' },
    { url: 'https://www.newsis.com/RSS/economy.xml', publisher: '뉴시스' },
];
const UA = 'Mozilla/5.0 (compatible; MOTUS-MarketCollector/1.0; +https://motusnova.blogspot.com)';
const CAUSAL = /힘입|기대|우려|영향|때문|따른|따라|반영|부담|쇼크|실망|충격|투심|투자심리|미치면서|못 미치|하회|상회|웃돌|밑돌|에\s?(?:상승|하락|급등|급락|강세|약세|반등)|실적|FOMC|연준|금리|관세|지표|물가|고용|순매수|순매도|매수세|매도세/;
const UP = /상승|올라|오른|강세|반등|급등|상승세|뛰/;
const DOWN = /하락|내려|내린|약세|급락|반납|떨어|밀려|흔들/;
function decode(value) {
    return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim();
}
const tag = (item, name) => { const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return match ? decode(match[1]) : ''; };
/** RFC 822 dates carry their zone; bare 'YYYY-MM-DD HH:MM:SS' dates (연합인포맥스) are Korean time. */
export function wireTime(value) {
    const bare = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
    return bare ? Date.parse(`${bare[1]}T${bare[2].length === 5 ? bare[2] + ':00' : bare[2]}+09:00`) : Date.parse(value);
}
/** The first sentence of the summary that gives a reason for the move (pure index-level lines are skipped). */
export function causalSentence(description) {
    const sentences = description.replace(/^\s*[[(][^\])]{0,40}[\])]\s*[^=]{0,30}=\s*/, '').split(/(?<=다\.)\s*|\n+/).map(item => item.trim()).filter(Boolean);
    for (const sentence of sentences) {
        if (sentence.length < 15 || sentence.length > 150)
            continue;
        const digits = (sentence.match(/\d/g) ?? []).length / sentence.length;
        if (digits > 0.12 || /후속기사|무단 전재|저작권/.test(sentence))
            continue;
        if (CAUSAL.test(sentence))
            return sentence;
    }
    return null;
}
export function parseWireFeed(xml, feed) {
    return xml.split(/<item[\s>]/).slice(1).map(item => {
        const title = tag(item, 'title'), url = tag(item, 'link'), published = wireTime(tag(item, 'pubDate'));
        return { publisher: feed.publisher, title, url, publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : '', sentence: causalSentence(tag(item, 'description')), feed: feed.url };
    }).filter(item => item.title && /^https:\/\//.test(item.url) && item.publishedAt);
}
const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
/** U.S. daylight time runs from the second Sunday of March to the first Sunday of November. */
function usDaylight(date) {
    const year = Number(date.slice(0, 4)), sunday = (month, nth) => { const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); return new Date(Date.UTC(year, month, 1 + ((7 - first) % 7) + (nth - 1) * 7)).toISOString().slice(0, 10); };
    return date >= sunday(2, 2) && date < sunday(10, 1);
}
/** Close window in UTC: the U.S. 16:00 ET close to the next Korean noon; the Korea 15:30 KST close to Korean midnight (next-morning previews fall outside). */
export function wireWindow(region, sessionDate) {
    return region === 'US' ? [Date.parse(sessionDate + (usDaylight(sessionDate) ? 'T20:00:00Z' : 'T21:00:00Z')), Date.parse(addDays(sessionDate, 1) + 'T03:00:00Z')] : [Date.parse(sessionDate + 'T06:30:00Z'), Date.parse(sessionDate + 'T15:00:00Z')];
}
/** Close reports only: openings, intraday, flash, preview and question headlines are not explanations of the session. */
export function isCloseReport(region, title) {
    if (/출발|개장|장중|오전|전망|주요공시|\[속보\]|1보|까\s*[?？]?$|[?？]/.test(title.replace(/\([^)]*\)\s*$/, '').trim()))
        return false;
    return region === 'US' ? /뉴욕증시|뉴욕 증시|미 증시|미국 증시/.test(title) && !/코스피|코스닥|국내 증시|아시아/.test(title) && /마감|하락|상승|혼조|일제히|급락|급등|↓|↑/.test(title) : /코스피/.test(title) && /마감|하락|상승|급락|급등|반납|↓|↑|내려|올라/.test(title) && !/코스닥(?:만|은)/.test(title);
}
/** A headline that names only the opposite direction of the verified move is dropped. */
export function contradictsDirection(title, change) {
    if (change === null || Math.abs(change) < 0.005)
        return false;
    const head = title.replace(/\([^)]*\)/g, '');
    const up = UP.test(head) || /↑/.test(head), down = DOWN.test(head) || /↓/.test(head);
    return change > 0 ? down && !up : up && !down;
}
/** One close report per publisher, preferring a report with a causal summary sentence, then the latest. */
export function selectWireReports(reports, region, sessionDate, change, now) {
    const [from, to] = wireWindow(region, sessionDate), end = Math.min(to, now);
    const eligible = [...new Map(reports.map(item => [item.url, item])).values()].filter(item => { const at = Date.parse(item.publishedAt); return at >= from && at <= end && isCloseReport(region, item.title) && !contradictsDirection(item.title, change); });
    const best = new Map();
    for (const item of eligible.sort((a, b) => Number(Boolean(b.sentence)) - Number(Boolean(a.sentence)) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt)))
        if (!best.has(item.publisher))
            best.set(item.publisher, item);
    return [...best.values()].filter(item => item.sentence || CAUSAL.test(item.title)).slice(0, 3);
}
export async function collectWireCloses(input) {
    const audit = [], all = [];
    await Promise.all(WIRE_FEEDS.map(async (feed) => {
        try {
            const response = await input.fetcher(feed.url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(15000) });
            if (!response.ok)
                throw new Error('WIRE_HTTP_' + response.status);
            all.push(...parseWireFeed(await response.text(), feed));
        }
        catch (error) {
            audit.push({ sourceId: 'wire:' + feed.url.replace(/^https:\/\//, ''), url: feed.url, status: 'FAILED', count: 0, error: error instanceof Error && /^WIRE_HTTP_\d{3}$/.test(error.message) ? error.message : 'WIRE_FETCH_FAILED' });
        }
    }));
    const reports = selectWireReports(all, input.region, input.sessionDate, input.change, input.now ?? Date.now());
    for (const report of reports)
        audit.push({ sourceId: 'wire:report:' + report.url.replace(/^https:\/\//, ''), url: report.url, status: 'PASS', count: 1, error: null });
    return { reports, audit };
}
