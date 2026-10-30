import { createHash } from 'node:crypto';
export const STALE_US_CHART_CAPTION = '2026년 9월 10~16일 정규장 종가';
export const CURRENT_US_CHART_CAPTION = '2026년 9월 29일~10월 5일 정규장 종가';
export async function correctPublishedUsCaption(input) {
    const { unit, postId, adapter } = input;
    const base = { postId, oldCaption: STALE_US_CHART_CAPTION, newCaption: CURRENT_US_CHART_CAPTION };
    const before = await adapter.readPost(postId);
    const beforeFingerprint = fingerprint(before.content);
    if (before.postId !== postId || before.status !== 'PUBLISHED' || before.title !== unit.title || !before.labels.includes(unit.render.label))
        return { ...base, patchCount: 0, state: 'HOLD', beforeFingerprint, afterFingerprint: null, httpStatus: null, chartValidation: false, sourceLinks: false, mobile: false, audit: null, error: 'published target identity mismatch' };
    const expected = article(unit.render.html);
    const staleExpected = expected.replace(CURRENT_US_CHART_CAPTION, STALE_US_CHART_CAPTION);
    if (canonical(before.content) === canonical(expected))
        return verifyExisting(before, beforeFingerprint);
    if (canonical(before.content) !== canonical(staleExpected))
        return { ...base, patchCount: 0, state: 'HOLD', beforeFingerprint, afterFingerprint: null, httpStatus: null, chartValidation: false, sourceLinks: false, mobile: false, audit: null, error: 'pre-patch content fingerprint mismatch' };
    await adapter.patchPost(postId, { title: unit.title, content: unit.render.html });
    const after = await adapter.readPost(postId);
    if (after.postId !== postId || after.status !== 'PUBLISHED' || canonical(after.content) !== canonical(expected))
        return { ...base, patchCount: 1, state: 'HOLD', beforeFingerprint, afterFingerprint: fingerprint(after.content), httpStatus: null, chartValidation: false, sourceLinks: false, mobile: false, audit: null, error: 'post-patch readback mismatch' };
    return finish(after, beforeFingerprint, 1);
    async function verifyExisting(post, prior) { return finish(post, prior, 0); }
    async function finish(post, prior, patchCount) { const url = post.url; if (!url)
        return { ...base, patchCount, state: 'HOLD', beforeFingerprint: prior, afterFingerprint: fingerprint(post.content), httpStatus: null, chartValidation: false, sourceLinks: false, mobile: false, audit: null, error: 'public permalink missing' }; const page = await adapter.fetchPublic(url); const chartValidation = (post.content.match(/<svg\b/gi) ?? []).length === 4 && ['7,773.95', '27,477.31', '51,267.90', '2,847.14', '+0.66%', '+1.05%', '+0.18%', '+0.5%'].every(value => post.content.includes(value)) && post.content.includes(CURRENT_US_CHART_CAPTION) && !post.content.includes(STALE_US_CHART_CAPTION); const sourceLinks = (post.content.match(/<a\b[^>]*href=["']https?:\/\//gi) ?? []).length >= 6; const mobile = /max-width\s*:\s*100%/i.test(post.content) && /box-sizing\s*:\s*border-box/i.test(post.content); const publicPass = page.status === 200 && page.body.includes(CURRENT_US_CHART_CAPTION); const pass = chartValidation && sourceLinks && mobile && publicPass; return { ...base, patchCount, state: pass ? 'PUBLISHED' : 'HOLD', beforeFingerprint: prior, afterFingerprint: fingerprint(post.content), httpStatus: page.status, chartValidation, sourceLinks, mobile, audit: pass ? { event: 'FACTUAL_DISPLAY_CORRECTION', detail: 'Hard-coded chart caption replaced with the verified series firstDate~lastDate; title, market values, body and sources unchanged' } : null, error: pass ? null : 'public correction validation failed' }; }
}
function article(html) { const found = html.match(/<article\b[^>]*>[\s\S]*<\/article>/i); if (!found)
    throw new Error('article missing'); return found[0]; }
function canonical(html) { return html.replaceAll('&amp;', '&').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim(); }
function fingerprint(value) { return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`; }
