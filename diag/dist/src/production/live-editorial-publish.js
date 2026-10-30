import { createHash } from 'node:crypto';
import { createSearchTrackingRegistration } from '../search/measurement.js';
export async function publishApprovedLiveUnit(input) {
    const { unit, draftPostId, approvedAt, adapter } = input;
    let publishCallCount = 0;
    let preflight = null;
    const audit = [{ at: approvedAt, event: 'HUMAN_REVIEW_APPROVED', detail: 'User explicitly approved this exact Blogger Draft for production publish' }];
    const base = { publicationId: unit.publicationId, category: unit.category, issueDate: unit.issueDate, draftPostId, approvedAt, review: { decision: 'APPROVED', reviewer: 'human', provenance: 'USER_EXPLICIT_APPROVAL' }, insertCount: 0, patchCount: 0, pdf: input.pdf ? { state: 'VALIDATED', reviewState: 'PENDING', visibility: 'PRIVATE', consistency: 'PASS' } : { state: 'NOT_GENERATED', reviewState: 'PENDING', visibility: 'PRIVATE', consistency: 'NOT_AVAILABLE' }, audit, commerce: { enabled: false } };
    try {
        const draft = await adapter.readPost(draftPostId);
        preflight = validateLiveContent(unit, draft, draftPostId, 'DRAFT');
        if (!preflight.pass)
            return hold('pre-publish content validation failed', 1, 0);
        const matches = await adapter.findMatches({ title: unit.title, label: unit.render.label });
        const others = matches.filter(post => post.postId !== draftPostId);
        if (others.length)
            return hold('remote duplicate exists besides approved Draft', 2, others.length);
        publishCallCount = 1;
        let published;
        try {
            published = await adapter.publishDraft(draftPostId);
        }
        catch (error) {
            const recovered = await adapter.readPost(draftPostId);
            if (recovered.status !== 'PUBLISHED' || !recovered.url)
                throw error;
            published = { postId: recovered.postId, publicPostUrl: recovered.url, publishedAt: new Date().toISOString() };
            audit.push({ at: published.publishedAt, event: 'PUBLISH_RESPONSE_RECOVERED', detail: 'publish response was uncertain; remote PUBLISHED state confirmed without retry' });
        }
        const stored = await adapter.readPost(draftPostId);
        const postflight = validateLiveContent(unit, stored, draftPostId, 'PUBLISHED');
        const page = await adapter.fetchPublic(published.publicPostUrl);
        const publicPage = page.status === 200 && publicPageSafe(page.body, unit);
        if (!postflight.pass || stored.url !== published.publicPostUrl || !publicPage)
            return { ...base, state: 'FAILED', publicPostUrl: null, publishedAt: null, remoteLookupCount: 4, remoteDuplicateCount: 0, publishCallCount, preflight, postflight, httpStatus: page.status, searchRegistration: null, libraryRegistration: null, weeklyFeed: null, error: 'post-publish remote or public-page validation failed' };
        const relations = relationsFrom(unit);
        const searchRegistration = createSearchTrackingRegistration(unit.publicationId, published.publicPostUrl, published.publishedAt);
        audit.push({ at: published.publishedAt, event: 'PUBLISHED', detail: `Blogger post ${draftPostId} published once and public page returned HTTP 200` });
        return { ...base, state: 'PUBLISHED', publicPostUrl: published.publicPostUrl, publishedAt: published.publishedAt, remoteLookupCount: 4, remoteDuplicateCount: 0, publishCallCount, preflight, postflight, httpStatus: page.status, searchRegistration, libraryRegistration: { publicationId: unit.publicationId, publicPostUrl: published.publicPostUrl, publishedAt: published.publishedAt, ...relations }, weeklyFeed: { category: unit.category, issueDate: unit.issueDate, publicationId: unit.publicationId, state: 'PUBLISHED' }, error: null };
    }
    catch (error) {
        return { ...base, state: 'FAILED', publicPostUrl: null, publishedAt: null, remoteLookupCount: publishCallCount ? 3 : 1, remoteDuplicateCount: 0, publishCallCount, preflight, postflight: null, httpStatus: null, searchRegistration: null, libraryRegistration: null, weeklyFeed: null, error: error instanceof Error ? error.message : String(error) };
    }
    function hold(error, remoteLookupCount, remoteDuplicateCount) { return { ...base, state: 'HOLD', publicPostUrl: null, publishedAt: null, remoteLookupCount, remoteDuplicateCount, publishCallCount: 0, preflight, postflight: null, httpStatus: null, searchRegistration: null, libraryRegistration: null, weeklyFeed: null, error }; }
}
export function validateLiveContent(unit, post, postId, state) { const expected = article(unit.render.html); const decodedContent = decode(post.content); const links = [...post.content.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match => decode(match[1])); const expectedLinks = [...expected.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match => decode(match[1])); const sourceHtml = post.content.slice(Math.max(0, post.content.lastIndexOf('주요 출처'))); const sourceLinks = [...sourceHtml.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match => decode(match[1])); const visible = post.content.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '').replace(/<[^>]+>/g, ' '); const svgCount = (post.content.match(/<svg\b/gi) ?? []).length; const checks = { postId: post.postId === postId, state: post.status === state, title: post.title === unit.title, label: post.labels.includes(unit.render.label), fingerprint: canonical(expected) === canonical(post.content), sourceAnchors: expectedLinks.length > 0 && expectedLinks.every(url => links.includes(url)), sourceDedupe: sourceLinks.length > 0 && new Set(sourceLinks).size === sourceLinks.length, rawUrlSafe: !/(?:https?:\/\/)[^\s<]+/i.test(visible), internalSafe: !/(?:eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore|claimId|reportId)/i.test(post.content), fixtureSafe: !/(?:fixture|sample marker|SAMPLE · PREVIEW)/i.test(post.content), commerceDisabled: !/(?:affiliate|제휴|광고|commerce)/i.test(post.content), mobile: /max-width\s*:\s*100%/i.test(post.content) && /box-sizing\s*:\s*border-box/i.test(post.content), colorRule: unit.category !== 'US_MARKET' || (post.content.includes('#c62828') && post.content.includes('#1565c0')), aiDepth: unit.category !== 'AI_INTELLIGENCE' || (['AI·산업 인텔리전스', '산업·기업 연결', '다음 확인사항'].every(text => decodedContent.includes(text)) && !/(?:무슨 일이 있었나|왜 중요한가|핵심 내용|시장 연결)\s*:?/i.test(decodedContent)), usMarket: unit.category !== 'US_MARKET' || (svgCount === 4 && ['S&P 500', 'Nasdaq', 'Dow Jones', 'Russell 2000', '최근 5거래일 종가'].every(text => decodedContent.includes(text))), svgCount }; return { ...checks, pass: Object.entries(checks).filter(([key]) => !['svgCount'].includes(key)).every(([, value]) => value === true) }; }
function publicPageSafe(html, unit) { return html.includes(unit.title) && html.includes('MOTUS') && !/(?:eventId|themeId|companyId|publicationId|confidenceScore|affiliate|commerce)/i.test(html); }
function relationsFrom(unit) { return { relatedEvents: unique(unit.plan.selected.map(item => item.eventId).filter((value) => Boolean(value))), relatedCompanies: unique(unit.plan.selected.flatMap(item => item.companyIds)), relatedThemes: unique(unit.plan.selected.flatMap(item => item.themeIds)), sourceRefs: unique(unit.plan.selected.flatMap(item => item.sourceRefs)) }; }
function article(html) { const match = html.match(/<article\b[^>]*>[\s\S]*<\/article>/i); if (!match)
    throw new Error('expected article missing'); return match[0]; }
function canonical(html) { return decode(html).replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim(); }
function decode(value) { return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'"); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort(); }
export function contentFingerprint(html) { return `sha256:${createHash('sha256').update(canonical(html)).digest('hex')}`; }
