export function evaluateEditorialQuality(title, html) {
    const reasons = [], notes = [];
    const decoded = decodeRepeated(html), withoutCode = decoded.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '), visible = withoutCode.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const blocks = [...withoutCode.matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/gi)].map(match => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(value => value.length >= 40);
    const korean = (title.match(/[가-힣]/g) ?? []).length, latin = (title.match(/[A-Za-z]/g) ?? []).length, bodyKorean = (visible.match(/[가-힣]/g) ?? []).length, bodyLatin = (visible.match(/[A-Za-z]/g) ?? []).length;
    if (title.length < 12 || !korean || latin > korean * 1.5)
        reasons.push('title is not natural Korean-first editorial copy');
    if (titleContainsCalendarDate(title))
        reasons.push('calendar date exposed in title');
    reasons.push(...titlePolicyViolations(title));
    if (/^\s*(?:MOTUS\b|AI 인텔리전스\s*:|미국증시 마감\s*:)/i.test(title))
        reasons.push('mechanical title prefix exposed');
    if (/<(?:script|style)\b/i.test(decoded))
        reasons.push('script or style payload present');
    if (/(?:^|[>\s])https?:\/\//i.test(visible))
        reasons.push('plain or encoded raw URL exposed');
    if (/(무슨 일이 있었나|왜 중요한가|핵심 내용|산업 연결|시장 연결)\s*:?/i.test(visible))
        reasons.push('internal editorial label exposed');
    if (visible.length < 500 || blocks.length < 3)
        reasons.push('article depth insufficient');
    if (blocks.length && new Set(blocks.map(normalize)).size !== blocks.length)
        reasons.push('boilerplate prose repetition detected');
    const koreanTextRatio = bodyKorean / Math.max(bodyKorean + bodyLatin, 1), englishCopiedTextRatio = bodyLatin / Math.max(bodyKorean + bodyLatin, 1);
    if (koreanTextRatio < 0.43 || englishCopiedTextRatio > 0.57)
        reasons.push('body contains excessive English copied text');
    if (/(?:&(?:amp;){1,3}lt;|&lt;)\s*(?:script|style|img|a)\b/i.test(html))
        reasons.push('double-encoded markup present');
    if (reasons.length === 0 && latin > korean)
        notes.push('English company or product names are concentrated; Korean-first context retained');
    return { pass: reasons.length === 0, reasons: [...new Set(reasons)], notes, visibleText: visible, proseBlockCount: blocks.length, koreanTextRatio, englishCopiedTextRatio };
}
export function titleContainsCalendarDate(title) {
    return /(?:\b(?:19|20)\d{2}[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12]\d|3[01])\b|(?:(?:19|20)\d{2}년\s*)?(?:0?[1-9]|1[0-2])월\s*(?:0?[1-9]|[12]\d|3[01])일)/u.test(title);
}
export function publisherConcentrationWarning(publishers, majorIssueVerified) { const normalized = publishers.map(value => value.trim().toLowerCase()).filter(Boolean); if (normalized.length < 2 || new Set(normalized).size > 1)
    return null; return majorIssueVerified ? 'publisher concentration accepted for one clearly verified major issue' : 'publisher concentration requires editorial review'; }
function decodeRepeated(value) { let result = value; for (let i = 0; i < 3; i++) {
    const next = result.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
    if (next === result)
        break;
    result = next;
} return result; }
function normalize(value) { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
// Public headline rules (editorial policy): Korean market usage, no trading-product names, correct particles.
const ENGLISH_INDEX_NAMES = /\b(?:Nasdaq|NASDAQ|Dow(?:\s+Jones)?|DJIA|KOSPI|KOSDAQ|Russell(?:\s*2000)?)\b/;
const TRADING_PRODUCT_NAMES = /(?:레버리지|인버스|선물단일종목|단일종목|곱버스|\bETF\b|\bETN\b|\b(?:KODEX|TIGER|KBSTAR|HANARO|ARIRANG)\b)/i;
// Nouns that legitimately end in 과/와/을 after a syllable whose batchim would otherwise mismatch.
const PARTICLE_EXCEPTIONS = new Set(['효과', '부과', '초과', '사과', '교과', '치과', '외과', '의과', '이과', '학과', '마을', '가을', '노을', '고을', '기와']);
export function titlePolicyViolations(title) {
    const reasons = [];
    if (ENGLISH_INDEX_NAMES.test(title))
        reasons.push('English market index name in title (use 나스닥·다우존스·코스피·코스닥·러셀)');
    if (TRADING_PRODUCT_NAMES.test(title))
        reasons.push('leveraged, inverse or ETF product name used as headline');
    if (titleParticleMismatch(title))
        reasons.push('Korean particle does not match the preceding word');
    return reasons;
}
export function titleParticleMismatch(title) {
    for (const match of title.matchAll(/([가-힣])(과|와|을|를|은|는|이|가)(?=[\s,·.!?]|$)/gu)) {
        const syllable = match[1], particle = match[2], index = match.index ?? 0, word = (title.slice(0, index + 2).match(/[가-힣]+$/u)?.[0]) ?? '';
        if (PARTICLE_EXCEPTIONS.has(word.slice(-2)) || word.length < 2)
            continue;
        // 이/가 and 은/는 are often word-final syllables (나이, 국가, 금은); only judge the clear 과/와 and 을/를 pairs.
        if (!['과', '와', '을', '를'].includes(particle))
            continue;
        const batchim = (syllable.charCodeAt(0) - 0xac00) % 28 !== 0;
        if ((particle === '과' || particle === '을') && !batchim)
            return true;
        if ((particle === '와' || particle === '를') && batchim)
            return true;
    }
    return false;
}
