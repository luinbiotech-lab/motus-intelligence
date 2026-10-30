import { createHash } from 'node:crypto';
import { isPublicBloggerPostUrl } from '../services/blogger.js';
import { createSearchTrackingRegistration } from '../search/measurement.js';
import { evaluateEditorialQuality } from './editorial-quality.js';
export const publicationFingerprint = (html) => 'sha256:' + createHash('sha256').update(html).digest('hex');
export function evaluateAutoPublishGate(c, at = new Date().toISOString()) {
    const u = c.unit, h = u.render.html;
    const quality = evaluateEditorialQuality(u.title, h);
    const r = [];
    if (c.verification !== 'VERIFIED')
        r.push('verification is not VERIFIED');
    if (c.unresolvedConflicts.length)
        r.push('unresolved verification conflict');
    if (c.duplicateUncertainty)
        r.push('duplicate state uncertain');
    if (!c.provenancePass)
        r.push('provenance validation failed');
    if (!c.sourceLinksPass || !/<a\b[^>]*href=["']https:\/\//i.test(h))
        r.push('source link validation failed');
    if (c.commerceEnabled)
        r.push('commerce must be disabled');
    if (c.publicationFingerprint !== publicationFingerprint(h) || c.publicationFingerprint !== 'sha256:' + u.contentFingerprint)
        r.push('publication fingerprint mismatch');
    if (!/max-width\s*:\s*100%/i.test(h) || !/(overflow-x\s*:\s*hidden|word-break\s*:\s*keep-all)/i.test(h))
        r.push('mobile-safe HTML missing');
    if (/(eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore|claimId|reportId)/i.test(h))
        r.push('internal token leakage');
    if (/(fixture|placeholder|sample marker)/i.test(h))
        r.push('non-production content marker');
    if (!quality.pass)
        r.push(...quality.reasons);
    if (u.readiness !== 'READY')
        r.push('publication unit is not ready');
    return { state: r.length ? 'HOLD' : 'AUTO_PUBLISH_READY', reasons: [...new Set(r)], approval: r.length ? null : 'AUTO_POLICY_APPROVAL', checkedAt: at };
}
export async function executeAutoPublish(c, a, at = new Date().toISOString()) {
    const preliminary = evaluateStaticGate(c, at), audit = [{ at, event: 'AUTO_PUBLISH_STATIC_GATE', detail: preliminary.state }];
    const resultBase = (gate) => ({ gate, searchRegistration: null, libraryRegistration: null, weeklyFeed: null, pdfCandidate: null, audit });
    if (preliminary.state !== 'AUTO_PUBLISH_READY')
        return { ...resultBase(preliminary), state: 'HOLD', draftPostId: null, publicPostUrl: null, publishedAt: null, insertCallCount: 0, publishCallCount: 0, error: preliminary.reasons.join('; ') };
    let insertCallCount = 0, publishCallCount = 0, draftPostId = null, phase = 'PREPUBLISH';
    try {
        const identity = { title: c.unit.title, label: c.unit.label, operationDate: c.operationDate ?? c.unit.observedDate, publicationFingerprint: c.publicationFingerprint };
        const matches = await a.findMatches(identity), published = matches.filter(post => post.status === 'PUBLISHED'), drafts = matches.filter(post => post.status === 'DRAFT');
        if (published.length || drafts.length > 1) {
            const gate = { state: 'HOLD', reasons: ['remote duplicate or already-published match'], approval: null, checkedAt: at };
            audit.push({ at, event: 'REMOTE_DUPLICATE_CHECK', detail: 'HOLD' });
            return { ...resultBase(gate), state: 'HOLD', draftPostId: drafts[0]?.postId ?? null, publicPostUrl: published[0]?.url ?? null, publishedAt: null, insertCallCount, publishCallCount, error: gate.reasons[0] };
        }
        const gate = evaluateAutoPublishGate({ ...c, duplicateUncertainty: false }, at);
        audit.push({ at, event: 'REMOTE_DUPLICATE_CHECK', detail: 'PASS' });
        const draft = drafts[0] ?? await a.insertDraft({ title: c.unit.title, content: c.unit.render.html, labels: [c.unit.label] });
        if (!drafts.length)
            insertCallCount = 1;
        draftPostId = draft.postId;
        const pre = await a.readPost(draftPostId);
        if (pre.status !== 'DRAFT' || pre.title !== c.unit.title || !pre.labels.includes(c.unit.label) || !storedContentValid(c.unit, pre))
            return { ...resultBase(gate), state: 'HOLD', draftPostId, publicPostUrl: null, publishedAt: null, insertCallCount, publishCallCount, error: 'draft readback validation failed' };
        const finalMatches = await a.findMatches(identity), otherMatches = finalMatches.filter(post => post.postId !== draftPostId);
        if (otherMatches.length) {
            const finalGate = { state: 'HOLD', reasons: ['final remote duplicate recheck failed'], approval: null, checkedAt: at };
            audit.push({ at, event: 'FINAL_REMOTE_DUPLICATE_CHECK', detail: 'HOLD' });
            return { ...resultBase(finalGate), state: 'HOLD', draftPostId, publicPostUrl: null, publishedAt: null, insertCallCount, publishCallCount, error: finalGate.reasons[0] };
        }
        audit.push({ at, event: 'FINAL_REMOTE_DUPLICATE_CHECK', detail: 'PASS' });
        publishCallCount = 1;
        phase = 'PUBLISH';
        let out;
        try {
            out = await a.publishDraft(draftPostId);
        }
        catch (error) {
            const remote = await a.readPost(draftPostId);
            if (remote.status !== 'PUBLISHED' || !isPublicBloggerPostUrl(remote.url))
                throw error;
            out = { postId: remote.postId, publicPostUrl: remote.url, publishedAt: at };
            audit.push({ at, event: 'UNCERTAIN_RESPONSE_RECOVERED', detail: 'readback before retry; no retry' });
        }
        phase = 'POSTFLIGHT';
        const remote = await a.readPost(draftPostId);
        if (remote.status !== 'PUBLISHED' || remote.url !== out.publicPostUrl || !isPublicBloggerPostUrl(remote.url) || !storedContentValid(c.unit, remote))
            throw new Error('published permalink readback failed');
        const page = await a.fetchPublic(out.publicPostUrl);
        if (page.status === 429) {
            audit.push({ at, event: 'PUBLIC_PAGE_RATE_LIMITED', detail: 'HTTP 429; Blogger API published readback and content verification passed' });
        }
        else if (page.status !== 200 || !page.body.includes(c.unit.title))
            throw new Error('public page validation failed: HTTP ' + page.status);
        const key = c.unit.publicationId + '|' + out.publicPostUrl;
        audit.push({ at: out.publishedAt, event: 'PUBLISHED', detail: 'AUTO_POLICY_APPROVAL' });
        return { ...resultBase(gate), state: 'PUBLISHED', draftPostId, publicPostUrl: out.publicPostUrl, publishedAt: out.publishedAt, insertCallCount, publishCallCount, searchRegistration: createSearchTrackingRegistration(c.unit.publicationId, out.publicPostUrl, out.publishedAt), libraryRegistration: { idempotencyKey: 'library:' + key }, weeklyFeed: { idempotencyKey: 'weekly:' + c.unit.publicationId }, pdfCandidate: { idempotencyKey: 'pdf:' + c.unit.publicationId + ':' + c.publicationFingerprint, visibility: 'PRIVATE' }, audit, error: null };
    }
    catch (error) {
        const gate = evaluateAutoPublishGate({ ...c, duplicateUncertainty: false }, at), reasonCode = publishCallCount > 0 || phase === 'POSTFLIGHT' ? 'PUBLISH_POSTFLIGHT_FAILED' : 'PUBLISH_OPERATION_FAILED';
        audit.push({ at, event: reasonCode, detail: 'remote readback required before retry' });
        return { ...resultBase(gate), state: 'FAILED', draftPostId, publicPostUrl: null, publishedAt: null, insertCallCount, publishCallCount, error: error instanceof Error ? error.message : String(error), reasonCode, remoteMayExist: publishCallCount > 0 };
    }
}
function evaluateStaticGate(c, at) { const gate = evaluateAutoPublishGate(c, at), reasons = gate.reasons.filter(reason => reason !== 'duplicate state uncertain'); return { state: reasons.length ? 'HOLD' : 'AUTO_PUBLISH_READY', reasons, approval: reasons.length ? null : 'AUTO_POLICY_APPROVAL', checkedAt: at }; }
function storedContentValid(unit, post) { const expected = canonical(article(unit.render.html)), actual = canonical(article(post.content)); const expectedLinks = links(expected), actualLinks = links(actual); return expected === actual && expectedLinks.length > 0 && expectedLinks.every(url => actualLinks.includes(url)) && /max-width\s*:\s*100%/i.test(actual) && !/(eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore|claimId|reportId)/i.test(actual); }
function article(html) { return html.match(/<article\b[^>]*>[\s\S]*<\/article>/i)?.[0] ?? html; }
function canonical(html) { return html.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim(); }
function links(html) { return [...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match => match[1].replaceAll('&amp;', '&')); }
