import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createNextLiveCycle } from './editorial/next-live-cycle.js';
import { createReviewDraft, publishApprovedNextDaily } from './production/next-daily-operations.js';
import { GoogleBloggerApiAdapter } from './services/blogger.js';
if (!process.argv.includes('--execute') || !process.argv.includes('--user-approved-ai-us'))
    throw new Error('explicit --execute --user-approved-ai-us flags required');
const now = new Date().toISOString();
const root = join(process.cwd(), 'data', 'live-editorial-cycle', '2026-10-07');
const config = await publishingConfig();
const google = new GoogleBloggerApiAdapter();
const actions = { lookup: 0, insert: 0, patch: 0, publish: 0 };
const adapter = { findMatches: async (input) => { actions.lookup++; return google.findMatchingPosts(input, config); }, readPost: async (id) => { actions.lookup++; return google.readPost(id, config); }, insertDraft: async (input) => { actions.insert++; return google.insertDraftContent(input, config); }, publishDraft: async (id) => { actions.publish++; return google.publishDraftPost(id, config); }, fetchPublic: async (url) => { const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'MOTUS-Daily-Production/1.0' } }); return { status: response.status, body: await response.text() }; } };
const cycle = createNextLiveCycle(now);
const approved = [{ category: 'AI_INTELLIGENCE', folder: 'ai', postId: '3144124090554362868' }, { category: 'US_MARKET', folder: 'us', postId: '2371588160186534300' }];
const results = [];
for (const target of approved) {
    const unit = requiredUnit(target.category);
    const existing = JSON.parse(await readFile(join(root, target.folder, 'publication.json'), 'utf8'));
    if (existing.draftPostId !== target.postId)
        throw new Error(`${target.category} approved Draft identity mismatch`);
    if (existing.state === 'PUBLISHED') {
        const remote = await adapter.readPost(target.postId);
        if (remote.status !== 'PUBLISHED' || remote.url !== existing.publicPostUrl)
            throw new Error(`${target.category} published recovery mismatch`);
        results.push(existing);
        continue;
    }
    const recoverableOAuthFailure = existing.state === 'FAILED' && existing.error === 'Blogger OAuth refresh failed (400)';
    const recoverableValidationHold = existing.state === 'HOLD' && existing.error === 'pre-publish validation failed' && existing.publishCount === 0;
    if (existing.state !== 'DRAFT' && !recoverableOAuthFailure && !recoverableValidationHold)
        throw new Error(`${target.category} approved Draft state mismatch`);
    const record = await publishApprovedNextDaily({ unit, draftPostId: target.postId, approvedAt: now, adapter });
    if (recoverableOAuthFailure)
        record.audit.unshift({ at: now, event: 'RETRY_AFTER_OAUTH_PROCESS_RELOAD', detail: 'Prior refresh failure preserved; no Blogger write occurred before this retry' });
    if (recoverableValidationHold)
        record.audit.unshift({ at: now, event: 'RETRY_AFTER_VALIDATION_RULE_FIX', detail: 'Prior source-dedupe false positive preserved; no publish call occurred before this retry' });
    results.push(record);
    await writeArtifacts(target.folder, unit, record);
}
const korea = requiredUnit('KOREA_MARKET');
const koreaRecord = await createReviewDraft({ unit: korea, at: now, adapter });
results.push(koreaRecord);
await writeArtifacts('korea', korea, koreaRecord);
await updateSearch(results);
await updateFeed(results);
const sourceChecks = await Promise.all(cycle.units.map(async (unit) => ({ category: unit.category, checks: await Promise.all(sourceUrls(unit).map(async (url) => ({ url, status: await reachable(url) }))) })));
const summary = { generatedAt: now, results: results.map(result => ({ category: result.category, issueDate: result.issueDate, draftPostId: result.draftPostId, state: result.state, publicPostUrl: result.publicPostUrl, publishCount: result.publishCount, insertCount: result.insertCount, remoteDuplicateCount: result.remoteDuplicateCount, httpStatus: result.publicHttpStatus, humanReviewState: result.humanReview.state, validation: result.validation, searchRegistration: result.searchRegistration })), sourceChecks, actions, menu: { state: 'PENDING_UI_ORGANIZATION', target: ['AI 인텔리전스', '미국증시', '국내증시', '주간 인텔리전스', '월간 인텔리전스', '리포트', 'MOTUS 소개'] }, commerce: { enabled: false } };
await writeFile(join(root, 'production-operation-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
function requiredUnit(category) { const unit = cycle.units.find(item => item.category === category); if (!unit)
    throw new Error(`${category} unit missing`); return unit; }
async function writeArtifacts(folder, unit, record) { const dir = join(root, folder); await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'preview.html'), unit.render.html, 'utf8'); await writeFile(join(dir, 'publication.json'), JSON.stringify(record, null, 2), 'utf8'); }
async function updateSearch(records) { const path = join(process.cwd(), 'data', 'search', '2026-10-07', 'publication-registrations.json'); await mkdir(resolve(path, '..'), { recursive: true }); let current = []; try {
    current = JSON.parse(await readFile(path, 'utf8'));
}
catch { } const next = [...current, ...records.flatMap(item => item.searchRegistration ? [item.searchRegistration] : [])]; const unique = next.filter((item, index, all) => all.findIndex(other => other.publicationId === item.publicationId) === index); await writeFile(path, JSON.stringify(unique, null, 2), 'utf8'); }
async function updateFeed(records) { const dir = join(process.cwd(), 'data', 'operations', '2026-10-07'); const path = join(dir, 'weekly-monthly-feed.json'); await mkdir(dir, { recursive: true }); let current = []; try {
    current = JSON.parse(await readFile(path, 'utf8'));
}
catch { } for (const record of records) {
    const item = { category: record.category, issueDate: record.issueDate, publicationId: record.publicationId, verificationState: 'VERIFIED', publicationState: record.state, publicPostUrl: record.publicPostUrl, publishedAt: record.publishedAt, articleFingerprint: record.contentFingerprint, searchTrackingState: record.searchRegistration ? 'QUEUED' : 'NOT_REGISTERED', weeklyReadiness: 'NOT_READY' };
    const index = current.findIndex(existing => existing.publicationId === record.publicationId);
    if (index >= 0)
        current[index] = item;
    else
        current.push(item);
} await writeFile(path, JSON.stringify(current, null, 2), 'utf8'); }
function sourceUrls(unit) { return [...new Set([...unit.render.html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match => match[1].replaceAll('&amp;', '&')))]; }
async function reachable(url) { try {
    const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 MOTUS-Source-Validation/1.0' }, signal: AbortSignal.timeout(15000) });
    return response.status;
}
catch {
    return 0;
} }
async function publishingConfig() { const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8')); const base = raw.blogger; const blogId = (base.blogIdEnvironmentVariable ? process.env[base.blogIdEnvironmentVariable] ?? base.blogId : base.blogId) ?? null; if (!blogId || !base.clientIdEnvironmentVariable || !process.env[base.clientIdEnvironmentVariable] || !base.clientSecretEnvironmentVariable || !process.env[base.clientSecretEnvironmentVariable] || !base.refreshTokenEnvironmentVariable || !process.env[base.refreshTokenEnvironmentVariable])
    throw new Error('Blogger credentials unavailable'); return { ...base, blogId, credentialAvailable: true, publishAsDraft: true }; }
import { assertMaintenanceWriteAllowed } from './production/maintenance-write-guard.js';
assertMaintenanceWriteAllowed('daily-production-operation-cli');
