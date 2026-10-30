import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { evaluateAutoPublishGate, executeAutoPublish } from './production/auto-publish.js';
import { candidateFromVerification } from './production/verification-artifact.js';
import { GoogleBloggerApiAdapter } from './services/blogger.js';
import { acquirePublicationLock, appendPublishLedger, findPublishedSameSession, findPublishedTitle, outcomeFileFor, persistedPublicationDecision, publicationIdentity, readPublishLedger } from './production/publication-operation.js';
const args = process.argv.slice(2);
const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const date = value('--date') ?? '', name = value('--category') ?? '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['ai', 'us', 'korea'].includes(name))
    throw new Error('--date YYYY-MM-DD and --category ai|us|korea required');
const root = join(process.cwd(), 'data', 'operations', date, name), unitPath = join(root, 'live-unit.json'), verificationPath = join(root, 'verification.json'), sourceAuditPath = join(root, 'live-source-audit.json'), crossPath = join(root, 'cross-verification.json');
await mkdir(root, { recursive: true });
if (!existsSync(unitPath) || !existsSync(verificationPath)) {
    await finish({ state: 'HOLD', reason: 'verified live unit or verification artifact missing', publishCallCount: 0 });
}
const rawUnit = JSON.parse(await readFile(unitPath, 'utf8'));
if (!rawUnit.render || !rawUnit.viewModel || rawUnit.readiness !== 'READY') {
    const reasons = [rawUnit.reasonCode, ...(rawUnit.readinessReasons ?? [])].filter((item) => Boolean(item));
    await finish({ state: rawUnit.status === 'SKIP' ? 'SKIP' : 'HOLD', reasonCode: reasons[0] ?? 'LIVE_UNIT_NOT_PUBLICATION_READY', reasonCodes: reasons.length ? reasons : ['LIVE_UNIT_NOT_PUBLICATION_READY'], reason: reasons.join('; ') || 'live unit is not publication-ready', insertCallCount: 0, publishCallCount: 0 });
}
const unit = rawUnit;
const verification = JSON.parse(await readFile(verificationPath, 'utf8'));
if (verification.operationDate !== date)
    await finish({ state: 'HOLD', reason: 'verification operationDate does not match requested operation', publishCallCount: 0 });
if (!existsSync(sourceAuditPath))
    await finish({ state: 'HOLD', reason: 'source audit artifact missing', publishCallCount: 0 });
const sourceAudit = JSON.parse(await readFile(sourceAuditPath, 'utf8')), sourceFingerprint = hash(sourceAudit.entries ?? []);
if (sourceFingerprint !== verification.sourceAuditFingerprint)
    await finish({ state: 'HOLD', reason: 'source audit fingerprint mismatch', publishCallCount: 0 });
if (verification.crossVerificationFingerprint) {
    if (!existsSync(crossPath))
        await finish({ state: 'HOLD', reason: 'cross-verification artifact missing', publishCallCount: 0 });
    const cross = JSON.parse(await readFile(crossPath, 'utf8'));
    if (hash(cross) !== verification.crossVerificationFingerprint)
        await finish({ state: 'HOLD', reason: 'cross-verification fingerprint mismatch', publishCallCount: 0 });
}
const now = new Date().toISOString(), candidate = candidateFromVerification(unit, verification, now), identity = publicationIdentity(date, unit.category);
const execute = args.includes('--execute');
if (!execute || process.env.MOTUS_LIVE_PUBLISH_ENABLED !== 'true') {
    const gate = evaluateAutoPublishGate(candidate);
    await finish({ state: gate.state, gate, publishCallCount: 0, execution: 'SIMULATED', commerce: { enabled: false } });
}
if (process.env.GITHUB_ACTIONS === 'true' && !existsSync(join(process.cwd(), 'data', '.ops-data-hydrated')))
    await finish({ state: 'HOLD', reasonCode: 'OPS_DATA_NOT_HYDRATED', reasonCodes: ['OPS_DATA_NOT_HYDRATED'], reason: 'durable ops-data ledger was not hydrated; live publication refused to avoid an undetectable same-session duplicate', insertCallCount: 0, publishCallCount: 0 });
const previousLedger = await readPublishLedger(root), persisted = persistedPublicationDecision(previousLedger, date, unit.category);
if (persisted.state === 'SKIP')
    await finish({ ...persisted, reason: 'persistent publish ledger already records this publication identity', insertCallCount: 0, publishCallCount: 0 });
const sameSession = await findPublishedSameSession(join(process.cwd(), 'data', 'operations'), name, unit.category, unit.observedDate);
if (sameSession)
    await finish({ state: 'SKIP', reasonCode: 'ALREADY_PUBLISHED_SAME_SESSION', reasonCodes: ['ALREADY_PUBLISHED_SAME_SESSION'], identity, sessionDate: unit.observedDate, previousOperationDate: sameSession.operationDate, postId: sameSession.postId, publicPostUrl: sameSession.publicPostUrl, reason: 'a publication for this category and session date is already recorded in the persistent ledger', insertCallCount: 0, publishCallCount: 0 });
const repeated = await findPublishedTitle(join(process.cwd(), 'data', 'operations'), name, date, unit.title);
if (repeated)
    await finish({ state: 'HOLD', reasonCode: 'TITLE_REPEATS_PRIOR_PUBLICATION', reasonCodes: ['TITLE_REPEATS_PRIOR_PUBLICATION'], identity, previousOperationDate: repeated.operationDate, publicPostUrl: repeated.publicPostUrl, reason: 'headline is identical to an earlier published article in this category', insertCallCount: 0, publishCallCount: 0 });
const required = ['BLOGGER_BLOG_ID', 'BLOGGER_CLIENT_ID', 'BLOGGER_CLIENT_SECRET', 'BLOGGER_REFRESH_TOKEN'];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length)
    await finish({ state: 'HOLD', reasonCode: 'BLOGGER_CREDENTIALS_MISSING', reason: `required Blogger credentials missing: ${missing.join(', ')}`, insertCallCount: 0, publishCallCount: 0 });
const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8')), config = { ...raw.blogger, blogId: process.env.BLOGGER_BLOG_ID.trim(), credentialAvailable: true, publishAsDraft: true };
const google = new GoogleBloggerApiAdapter();
try {
    await writeFile(join(root, 'oauth-health.json'), JSON.stringify(await google.healthCheck(config), null, 2), 'utf8');
}
catch (error) {
    await finish({ state: 'HOLD', reason: error instanceof Error ? error.message : 'Blogger OAuth health check failed', publishCallCount: 0 });
}
const release = await acquirePublicationLock(root, date, unit.category);
await appendPublishLedger(root, { identity, operationDate: date, sessionDate: unit.observedDate, category: unit.category, at: now, event: 'LOCK_ACQUIRED', postId: null, publicPostUrl: null, fingerprint: candidate.publicationFingerprint, detail: 'exclusive local operation lock acquired' });
const adapter = { findMatches: (input) => google.findMatchingPosts(input, config), insertDraft: (input) => google.insertDraftContent(input, config), readPost: (id) => google.readPost(id, config), publishDraft: (id) => google.publishDraftPost(id, config), fetchPublic: async (url) => { const response = await fetch(url, { redirect: 'follow' }); return { status: response.status, body: await response.text() }; } };
const preGate = evaluateAutoPublishGate({ ...candidate, duplicateUncertainty: false }, now);
if (preGate.state !== 'AUTO_PUBLISH_READY') {
    await appendPublishLedger(root, { identity, operationDate: date, sessionDate: unit.observedDate, category: unit.category, at: now, event: 'GATE_HOLD', gateState: 'HOLD', publishAttempted: false, reason: preGate.reasons.join('; '), postId: null, publicPostUrl: null, fingerprint: candidate.publicationFingerprint, detail: preGate.reasons.join('; ') });
    await release();
    await finish({ state: 'HOLD', gate: preGate, reasonCodes: preGate.reasons, reason: preGate.reasons.join('; '), insertCallCount: 0, publishCallCount: 0 });
}
let result;
try {
    await appendPublishLedger(root, { identity, operationDate: date, sessionDate: unit.observedDate, category: unit.category, at: now, event: 'PUBLISH_ATTEMPT', postId: null, publicPostUrl: null, fingerprint: candidate.publicationFingerprint, detail: 'remote identity lookup and one-shot publish started' });
    result = await executeAutoPublish(candidate, adapter, now);
    await appendPublishLedger(root, { identity, operationDate: date, sessionDate: unit.observedDate, category: unit.category, at: new Date().toISOString(), event: result.state === 'PUBLISHED' ? 'PUBLISHED' : result.state === 'FAILED' ? 'FAILED' : 'GATE_HOLD', ...(result.state === 'PUBLISHED' ? { sourceUrls: unit.viewModel.sources.map(source => source.url) } : {}), postId: result.draftPostId, publicPostUrl: result.publicPostUrl, fingerprint: candidate.publicationFingerprint, detail: result.reasonCode ?? result.error ?? result.gate.state });
}
finally {
    await release();
}
await writeFile(join(root, 'auto-publish.json'), JSON.stringify(result, null, 2), 'utf8');
if (result.state === 'PUBLISHED')
    await persist(result, unit);
console.log(JSON.stringify({ state: result.state, draftPostId: result.draftPostId, publicPostUrl: result.publicPostUrl, publishCallCount: result.publishCallCount }));
async function finish(value) { const target = await outcomePath(value); await writeFile(join(root, target), JSON.stringify(value, null, 2), 'utf8'); console.log(JSON.stringify(target === 'auto-publish.json' ? value : { ...value, outcomeFile: target, preservedPublishedOutcome: true })); process.exit(0); }
// A recorded PUBLISHED outcome is authoritative; a later simulation or HOLD for the same identity is kept beside it, never over it.
async function outcomePath(value) { return outcomeFileFor(root, value?.state); }
async function persist(result, current) { const searchPath = join(process.cwd(), 'data', 'search', date, 'auto-registrations.json'), libraryPath = join(process.cwd(), 'data', 'library', 'publications', 'auto-publications.json'), weeklyPath = join(process.cwd(), 'data', 'operations', date, 'weekly-monthly-feed-auto.json'), pdfPath = join(process.cwd(), 'data', 'reports', 'daily', date, name, 'candidate.json'); await Promise.all([upsert(searchPath, result.searchRegistration, 'publicationId'), upsert(libraryPath, { ...result.libraryRegistration, publicationId: current.publicationId, publicPostUrl: result.publicPostUrl, publishedAt: result.publishedAt }, 'idempotencyKey'), upsert(weeklyPath, { ...result.weeklyFeed, category: current.category, publicationId: current.publicationId, publicPostUrl: result.publicPostUrl, publishedAt: result.publishedAt }, 'idempotencyKey'), writeObject(pdfPath, { ...result.pdfCandidate, issueDate: current.observedDate, articleFingerprint: current.contentFingerprint, state: 'PENDING', visibility: 'PRIVATE' })]); }
async function upsert(path, item, key) { if (!item)
    return; let values = []; try {
    values = JSON.parse(await readFile(path, 'utf8'));
}
catch { } const record = item, index = values.findIndex(value => value[key] === record[key]); if (index >= 0)
    values[index] = record;
else
    values.push(record); await writeObject(path, values); }
async function writeObject(path, value) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2), 'utf8'); }
function hash(value) { return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
