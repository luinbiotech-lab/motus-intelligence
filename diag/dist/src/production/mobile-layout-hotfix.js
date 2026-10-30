import { contentFingerprint } from './live-editorial-publish.js';
export const MOBILE_REGRESSION_WIDTHS = [320, 360, 375, 390, 430];
export async function patchPublishedMobileLayout(input) {
    const expected = article(input.unit.render.html);
    const before = await input.adapter.readPost(input.postId);
    const beforeFingerprint = contentFingerprint(before.content);
    const beforeAudit = auditMobileMarkup(before.content);
    const rootCause = { fixedHalfWidthChartCells: /width:50%;max-width:50%/.test(before.content), nonWrappingFlexRows: /display:flex!important;flex-wrap:nowrap!important/.test(before.content), responsiveSvgMissing: (before.content.match(/<svg\b[^>]*width=["']100%["']/gi) ?? []).length !== 4, outerOverflowGuardMissing: !/overflow-x\s*:\s*hidden/i.test(before.content) };
    const legacyLayout = Object.values(rootCause).every(Boolean);
    let fingerprintGuard = beforeFingerprint === input.expectedBeforeFingerprint ? 'EXACT_MATCH' : legacyLayout ? 'LEGACY_LAYOUT_RECOVERED' : beforeAudit.pass ? 'CURRENT_LAYOUT_VERIFIED' : 'FAILED';
    const base = { postId: input.postId, publishCount: 0, beforeFingerprint, fingerprintGuard, rootCause, beforeAudit };
    if (before.postId !== input.postId || before.status !== 'PUBLISHED' || before.title !== input.unit.title || !before.labels.includes(input.unit.render.label))
        return hold('published target identity mismatch');
    if (visible(before.content) !== visible(expected))
        return hold('layout candidate changed public text or facts');
    if (!sameSources(before.content, expected))
        return hold('layout candidate changed source URLs');
    if (beforeAudit.pass) {
        if (!before.url)
            return hold('public permalink missing');
        const page = await input.adapter.fetchPublic(before.url);
        const publicAudit = auditMobileMarkup(page.body);
        if (page.status !== 200 || !page.body.includes(input.unit.title) || !publicAudit.pass)
            return { ...base, fingerprintGuard, state: 'HOLD', patchCount: 0, afterFingerprint: beforeFingerprint, afterAudit: beforeAudit, httpStatus: page.status, publicAudit, factsPreserved: true, sourcesPreserved: true, titlePreserved: true, labelPreserved: true, error: 'existing public mobile layout validation failed' };
        return { ...base, fingerprintGuard, state: 'PUBLISHED', patchCount: 0, afterFingerprint: beforeFingerprint, afterAudit: beforeAudit, httpStatus: page.status, publicAudit, factsPreserved: true, sourcesPreserved: true, titlePreserved: true, labelPreserved: true, error: null };
    }
    if (fingerprintGuard === 'FAILED')
        return hold('pre-patch content fingerprint mismatch without a recognized legacy layout');
    const candidateAudit = auditMobileMarkup(expected);
    if (!candidateAudit.pass)
        return hold('mobile layout candidate failed static safety audit');
    await input.adapter.patchPost(input.postId, { title: input.unit.title, content: input.unit.render.html });
    const after = await input.adapter.readPost(input.postId);
    const afterAudit = auditMobileMarkup(after.content);
    const factsPreserved = visible(before.content) === visible(after.content);
    const sourcesPreserved = sameSources(before.content, after.content);
    if (after.postId !== input.postId || after.status !== 'PUBLISHED' || after.title !== input.unit.title || !after.labels.includes(input.unit.render.label) || !afterAudit.pass || !factsPreserved || !sourcesPreserved)
        return { ...base, state: 'HOLD', patchCount: 1, afterFingerprint: contentFingerprint(after.content), afterAudit, httpStatus: null, publicAudit: null, factsPreserved, sourcesPreserved, titlePreserved: after.title === input.unit.title, labelPreserved: after.labels.includes(input.unit.render.label), error: 'post-patch readback validation failed' };
    if (!after.url)
        return { ...base, state: 'HOLD', patchCount: 1, afterFingerprint: contentFingerprint(after.content), afterAudit, httpStatus: null, publicAudit: null, factsPreserved, sourcesPreserved, titlePreserved: true, labelPreserved: true, error: 'public permalink missing' };
    const page = await input.adapter.fetchPublic(after.url);
    const publicAudit = auditMobileMarkup(page.body);
    if (page.status !== 200 || !page.body.includes(input.unit.title) || !publicAudit.pass)
        return { ...base, state: 'HOLD', patchCount: 1, afterFingerprint: contentFingerprint(after.content), afterAudit, httpStatus: page.status, publicAudit, factsPreserved, sourcesPreserved, titlePreserved: true, labelPreserved: true, error: 'public page mobile validation failed' };
    return { ...base, state: 'PUBLISHED', patchCount: 1, afterFingerprint: contentFingerprint(after.content), afterAudit, httpStatus: page.status, publicAudit, factsPreserved, sourcesPreserved, titlePreserved: true, labelPreserved: true, error: null };
    function hold(error) { return { ...base, state: 'HOLD', patchCount: 0, afterFingerprint: null, afterAudit: null, httpStatus: null, publicAudit: null, factsPreserved: false, sourcesPreserved: false, titlePreserved: false, labelPreserved: false, error }; }
}
export function auditMobileMarkup(html) {
    const scoped = html.match(/<article\b[^>]*data-product=["']motus-us-market["'][^>]*>[\s\S]*?<\/article>/i)?.[0] ?? html;
    const svgCount = (scoped.match(/<svg\b/gi) ?? []).length;
    const result = {
        outerContainment: /width\s*:\s*100%;max-width\s*:\s*(?:100%|820px);box-sizing\s*:\s*border-box/i.test(scoped) && /overflow-x\s*:\s*hidden/i.test(scoped),
        fixedMinWidthAbsent: !/(?:min-width\s*:\s*(?!0(?:px|em|rem|%|;))\d+(?:px|em|rem)|min-width=["']\d+)/i.test(scoped),
        unsafeFlexRowsAbsent: !/display\s*:\s*flex!important;flex-wrap\s*:\s*nowrap!important/i.test(scoped),
        fixedHalfWidthChartCellsAbsent: !/index-trend-(?:row|cell)[\s\S]{0,180}width\s*:\s*50%/i.test(scoped),
        responsiveGrid: /data-layout=["']responsive-two-by-two["'][^>]*style=["'][^"']*grid-template-columns\s*:\s*repeat\(auto-fit,minmax\(min\(100%,260px\),1fr\)\)/i.test(scoped),
        cardContainment: (scoped.match(/class=["']index-trend-card["'][^>]*style=["'][^"']*max-width\s*:\s*100%[^"']*min-width\s*:\s*0/gi) ?? []).length === 4,
        svgCount,
        responsiveSvg: svgCount === 4 && (scoped.match(/<svg\b[^>]*width=["']100%["'][^>]*viewBox=["']0 0 240 112["']/gi) ?? []).length === 4,
        titleWrappingSafe: !/word-break\s*:\s*break-all/i.test(scoped) && (scoped.match(/<h3\b[^>]*white-space\s*:\s*nowrap[^>]*word-break\s*:\s*keep-all/gi) ?? []).length >= 4,
        sourceLinks: (scoped.match(/<a\b[^>]*href=["']https:\/\//gi) ?? []).length > 0,
        dateCaption: /정규장 종가/.test(scoped),
        colorRule: scoped.includes('#c62828') && scoped.includes('#1565c0'),
        commerceAbsent: !/(?:affiliate|제휴|광고|commerce)/i.test(scoped),
        pass: false
    };
    result.pass = Object.entries(result).filter(([key]) => !['svgCount', 'pass'].includes(key)).every(([, value]) => value === true);
    return result;
}
function article(html) { const match = html.match(/<article\b[^>]*>[\s\S]*<\/article>/i); if (!match)
    throw new Error('article missing'); return match[0]; }
function visible(html) { return decode(html.replace(/<svg\b[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function sameSources(left, right) { return JSON.stringify(sourceUrls(left)) === JSON.stringify(sourceUrls(right)); }
function sourceUrls(html) { return [...new Set([...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match => decode(match[1])))].sort(); }
function decode(value) { return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'"); }
