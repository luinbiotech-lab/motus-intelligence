import { createHash } from 'node:crypto';
import { validateLiveDailyPayload } from '../operations/live-daily.js';
import { evaluateEditorialQuality, publisherConcentrationWarning } from './editorial-quality.js';
/** Sources that can corroborate the article's core claims; supplementary context is excluded. */
export function coreEvidenceSources(sources) { return sources.filter(source => source.role !== 'SUPPLEMENTARY'); }
export function buildProductionVerification(payload, sourceMode, audit, verifiedAt, crossVerification = null, operationDate = payload.unit.observedDate) {
    const unit = payload.unit, reasons = validateLiveDailyPayload(unit.category, payload, verifiedAt), urls = unit.viewModel.sources.map(source => source.url), passed = new Set(audit.filter(item => item.status === 'PASS').map(item => canonical(item.url))), html = unit.render.html;
    const coreSources = coreEvidenceSources(unit.viewModel.sources), sourceDomains = new Set(coreSources.map(source => providerDomain(source.url))), sourceDiversityPass = sourceDomains.size >= 2;
    const provenancePass = sourceMode !== 'snapshot' && urls.length > 0 && urls.every(url => passed.has(canonical(url))) && sourceDiversityPass;
    const renderedLinks = new Set([...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match => canonical(decode(match[1])))), sourceLinksPass = urls.length > 0 && urls.every(url => renderedLinks.has(canonical(url)));
    const mobilePass = /max-width\s*:\s*100%/i.test(html) && /(overflow-x\s*:\s*hidden|word-break\s*:\s*keep-all)/i.test(html);
    const quality = evaluateEditorialQuality(unit.title, html), editorialQualityPass = quality.pass;
    const concentration = unit.category === 'AI_INTELLIGENCE' ? publisherConcentrationWarning(coreSources.map(item => item.publisher).filter((value) => Boolean(value)), unit.viewModel.issues.length === 1) : null, editorialWarnings = [...quality.notes, ...(concentration ? [concentration] : [])];
    const leakagePass = !/(eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore|claimId|reportId|fixture|placeholder)/i.test(html);
    if (unit.category === 'KOREA_MARKET' && crossVerification?.verification !== 'VERIFIED')
        reasons.push('Korea official cross-verification failed');
    if (!sourceDiversityPass)
        reasons.push('independent source diversity failed');
    if (!provenancePass)
        reasons.push('production provenance audit failed');
    if (!sourceLinksPass)
        reasons.push('public source links failed');
    if (!mobilePass)
        reasons.push('mobile validation failed');
    if (!editorialQualityPass)
        reasons.push(...quality.reasons.map(reason => 'editorial quality: ' + reason));
    if (concentration?.includes('requires editorial review'))
        reasons.push('editorial quality: publisher concentration requires editorial review');
    if (!leakagePass)
        reasons.push('public leakage validation failed');
    const unresolvedConflicts = [...new Set(reasons)], verification = unresolvedConflicts.length ? 'REVIEW_REQUIRED' : 'VERIFIED';
    const sourceAuditIds = audit.filter(item => item.status === 'PASS').map(item => item.sourceId).sort();
    return { schemaVersion: '1.1', category: unit.category, operationDate, observedDate: unit.observedDate, sourceMode, verification, unresolvedConflicts, provenancePass, sourceDiversityPass, sourceLinksPass, mobilePass, editorialQualityPass, leakagePass, duplicateCheck: 'PENDING_REMOTE', duplicateUncertainty: true, articleFingerprint: 'sha256:' + createHash('sha256').update(html).digest('hex'), commerceEnabled: false, verifiedAt, expiresAt: new Date(Date.parse(verifiedAt) + 90 * 60 * 1000).toISOString(), sourceAuditIds, sourceAuditFingerprint: fingerprint(audit), crossVerificationFingerprint: crossVerification ? fingerprint(crossVerification) : null, crossVerification, ...(editorialWarnings.length ? { editorialWarnings } : {}) };
}
export function candidateFromVerification(unit, artifact, at = artifact.verifiedAt) { const mismatch = artifact.schemaVersion !== '1.1' || artifact.sourceMode !== 'internal' || artifact.category !== unit.category || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(artifact.operationDate) || artifact.observedDate !== unit.observedDate || artifact.articleFingerprint !== 'sha256:' + unit.contentFingerprint || !artifact.sourceAuditFingerprint || Date.parse(at) > Date.parse(artifact.expiresAt); return { unit, operationDate: artifact.operationDate, verification: mismatch ? 'FAILED' : artifact.verification, unresolvedConflicts: mismatch ? [...artifact.unresolvedConflicts, 'verification artifact is stale, non-internal, or context/fingerprint mismatched'] : artifact.unresolvedConflicts, duplicateUncertainty: artifact.duplicateUncertainty || artifact.duplicateCheck === 'PENDING_REMOTE', provenancePass: artifact.provenancePass, sourceLinksPass: artifact.sourceLinksPass, publicationFingerprint: artifact.articleFingerprint, commerceEnabled: false }; }
function providerDomain(value) { try {
    const parts = new URL(value).hostname.toLowerCase().split('.');
    return parts.slice(-2).join('.');
}
catch {
    return '';
} }
function canonical(value) { try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname.length > 1)
        url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
}
catch {
    return value;
} }
function decode(value) { return value.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"'); }
function fingerprint(value) { return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
