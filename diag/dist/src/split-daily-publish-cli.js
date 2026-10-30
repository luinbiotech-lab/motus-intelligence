import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createFirstSplitDailyProductionRun } from './intelligence/split-daily-production.js';
import { GoogleBloggerApiAdapter } from './services/blogger.js';
import { publishSplitDailyUnit } from './production/split-daily-publish.js';
if (!process.argv.includes('--execute') || !process.argv.includes('--human-approved'))
    throw new Error('explicit --execute --human-approved flags required for real Blogger production publish');
const startedAt = new Date().toISOString();
const runDate = startedAt.slice(0, 10);
const root = join(process.cwd(), 'data', 'production-publish', runDate);
await mkdir(root, { recursive: true });
const config = await publishingConfig();
if (!config.credentialAvailable)
    throw new Error('Blogger production credentials are incomplete');
const google = new GoogleBloggerApiAdapter();
const adapter = { findMatches: input => google.findMatchingPosts(input, config), insertDraft: input => google.insertDraftContent(input, config), readPost: id => google.readPost(id, config), publishDraft: id => google.publishDraftPost(id, config), fetchPublic: async (url) => { const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'MOTUS-Publication-Verification/1.0' } }); return { status: response.status, body: await response.text() }; } };
const run = createFirstSplitDailyProductionRun(startedAt);
const records = [];
const sourceChecks = {};
for (const unit of run.units) {
    const folder = unit.category === 'AI_INTELLIGENCE' ? 'ai' : unit.category === 'US_MARKET' ? 'us' : 'korea';
    const unitRoot = join(root, folder);
    await mkdir(unitRoot, { recursive: true });
    const checks = await validateDestinations(unit.viewModel.sources);
    sourceChecks[unit.category] = checks;
    const sourcePass = checks.every(item => item.pass);
    const artifactPath = unit.category === 'AI_INTELLIGENCE' ? 'data/reports/daily/2026-09-29/ai/artifact.json' : unit.category === 'US_MARKET' ? 'data/reports/daily/2026-09-30/us/artifact.json' : 'data/reports/daily/2026-09-30/korea/artifact.json';
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
    const pdfConsistency = artifact.consistency?.state === 'PASS' ? 'PASS' : 'FAIL';
    const record = await publishSplitDailyUnit({ unit, adapter, reviewedAt: startedAt, pdfConsistency, sourceDestinationValidation: sourcePass ? 'PASS' : 'FAIL' });
    records.push(record);
    await Promise.all([writeFile(join(unitRoot, 'publication.json'), JSON.stringify(record, null, 2), 'utf8'), writeFile(join(unitRoot, 'source-validation.json'), JSON.stringify(checks, null, 2), 'utf8'), writeFile(join(unitRoot, 'review.json'), JSON.stringify(record.review, null, 2), 'utf8')]);
}
await updateReviewPackage(records);
await updateFeed(records);
await mkdir(join(process.cwd(), 'data', 'search', runDate), { recursive: true });
await writeFile(join(process.cwd(), 'data', 'search', runDate, 'publication-registrations.json'), JSON.stringify(records.flatMap(item => item.searchTrackingRegistration ? [item.searchTrackingRegistration] : []), null, 2), 'utf8');
await writeFile(join(root, 'run-summary.json'), JSON.stringify({ startedAt, completedAt: new Date().toISOString(), records, sourceChecks, commerce: { enabled: false }, protectedPostId: '9009523239057574527' }, null, 2), 'utf8');
console.log(JSON.stringify({ records: records.map(item => ({ category: item.category, issueDate: item.issueDate, draftPostId: item.draftPostId, state: item.state, publicPostUrl: item.publicPostUrl, httpStatus: item.publicHttpStatus, label: item.label, duplicateCount: item.remoteDuplicateCount, insertCalls: item.postsInsertCallCount, publishCalls: item.publishApiCallCount, sourceValidation: item.sourceDestinationValidation, chartValidation: item.publicValidation?.chart ?? false, mobileValidation: item.publicValidation?.mobile ?? false, searchRegistration: Boolean(item.searchTrackingRegistration), pdfConsistency: item.pdfConsistency, error: item.error })), outputRoot: root }, null, 2));
async function publishingConfig() { const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8')); const base = raw.blogger; const blogId = (base.blogIdEnvironmentVariable ? process.env[base.blogIdEnvironmentVariable] ?? base.blogId : base.blogId) ?? null; const available = Boolean(blogId && (base.clientIdEnvironmentVariable && process.env[base.clientIdEnvironmentVariable]) && (base.clientSecretEnvironmentVariable && process.env[base.clientSecretEnvironmentVariable]) && (base.refreshTokenEnvironmentVariable && process.env[base.refreshTokenEnvironmentVariable])); return { ...base, blogId, credentialAvailable: available, publishAsDraft: true }; }
async function validateDestinations(sources) { const unique = [...new Map(sources.map(item => [item.url, item])).values()]; return Promise.all(unique.map(async (source) => { try {
    const response = await fetch(source.url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 MOTUS source verification' } });
    const pass = response.status !== 404 && response.status !== 410 && response.status < 500;
    await response.body?.cancel();
    return { label: source.label, url: source.url, status: response.status, pass, error: null };
}
catch (error) {
    return { label: source.label, url: source.url, status: null, pass: false, error: error instanceof Error ? error.message : 'network error' };
} })); }
async function updateReviewPackage(records) { const path = join(process.cwd(), 'data', 'split-daily', '2026-09-30', 'review-package.json'); const value = JSON.parse(await readFile(path, 'utf8')); value.units = value.units.map(unit => { const record = records.find(item => item.publicationId === unit.publicationId); return record ? { ...unit, humanReview: record.review, publicationState: record.state, draftPostId: record.draftPostId, publicPostUrl: record.publicPostUrl, duplicateCount: record.remoteDuplicateCount, productionAudit: record.audit } : unit; }); value.externalActions = { bloggerInsertCount: records.reduce((n, item) => n + item.postsInsertCallCount, 0), publishCount: records.reduce((n, item) => n + item.publishApiCallCount, 0) }; await writeFile(path, JSON.stringify(value, null, 2), 'utf8'); }
async function updateFeed(records) { const path = join(process.cwd(), 'data', 'operations', '2026-10-01', 'weekly-monthly-feed.json'); if (!existsSync(path))
    return; const feed = JSON.parse(await readFile(path, 'utf8')); const updated = feed.map(item => { const record = records.find(value => value.publicationId === item.publicationId); return record ? { ...item, publicPublicationRequired: record.state !== 'PUBLISHED', publicationState: record.state, publicPostUrl: record.publicPostUrl, publishedAt: record.publishedAt, articleFingerprint: record.articleFingerprint, pdfConsistency: record.pdfConsistency, searchTrackingState: record.searchTrackingRegistration ? 'QUEUED' : 'NOT_REGISTERED' } : item; }); await writeFile(path, JSON.stringify(updated, null, 2), 'utf8'); }
import { assertMaintenanceWriteAllowed } from './production/maintenance-write-guard.js';
assertMaintenanceWriteAllowed('split-daily-publish-cli');
