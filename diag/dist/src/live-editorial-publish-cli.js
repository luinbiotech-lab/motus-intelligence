import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createLiveEditorialCycle } from './editorial/live-cycle.js';
import { publishApprovedLiveUnit } from './production/live-editorial-publish.js';
import { GoogleBloggerApiAdapter } from './services/blogger.js';
if (!process.argv.includes('--execute') || !process.argv.includes('--user-approved'))
    throw new Error('explicit --execute --user-approved flags required');
const approvedAt = new Date().toISOString();
const root = join(process.cwd(), 'data', 'live-editorial-cycle', '2026-10-06');
const cycle = createLiveEditorialCycle(approvedAt);
const targets = [{ category: 'AI_INTELLIGENCE', postId: '4294902999154862199', folder: 'ai' }, { category: 'US_MARKET', postId: '614930389904987485', folder: 'us' }];
const config = await publishingConfig();
const google = new GoogleBloggerApiAdapter();
const adapter = { findMatches: input => google.findMatchingPosts(input, config), readPost: id => google.readPost(id, config), publishDraft: id => google.publishDraftPost(id, config), fetchPublic: async (url) => { const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'MOTUS-Production-Verification/1.0' } }); return { status: response.status, body: await response.text() }; } };
const records = [];
for (const target of targets) {
    const unit = cycle.units.find(item => item.category === target.category);
    if (!unit)
        throw new Error(`${target.category} unit missing`);
    const record = await publishApprovedLiveUnit({ unit, draftPostId: target.postId, approvedAt, adapter });
    records.push(record);
    await writeFile(join(root, target.folder, 'publication.json'), JSON.stringify(record, null, 2), 'utf8');
    const operationPath = join(root, target.folder, 'operation.json');
    const operation = JSON.parse(await readFile(operationPath, 'utf8'));
    await writeFile(operationPath, JSON.stringify({ ...operation, humanReviewState: 'APPROVED', reviewer: 'human', approvedAt, reviewProvenance: 'USER_EXPLICIT_APPROVAL', draftState: record.state, publicPostUrl: record.publicPostUrl, publishCount: record.publishCallCount, searchRegistration: record.searchRegistration, pdf: record.pdf, audit: record.audit }, null, 2), 'utf8');
    const planPath = join(root, target.folder, 'editorial-plan.json');
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    await writeFile(planPath, JSON.stringify({ ...plan, reviewState: 'APPROVED', reviewedBy: 'human', reviewedAt: approvedAt, reviewProvenance: 'USER_EXPLICIT_APPROVAL' }, null, 2), 'utf8');
}
if (records.some(item => item.state !== 'PUBLISHED')) {
    await writeFile(join(root, 'publish-attempt.json'), JSON.stringify({ approvedAt, records, commerce: { enabled: false } }, null, 2), 'utf8');
    throw new Error(`publish incomplete: ${records.map(item => `${item.category}=${item.state}`).join(', ')}`);
}
await Promise.all([updateSearch(records), updateWeekly(records), updateLibrary(records)]);
const summaryPath = join(root, 'run-summary.json');
const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
const prior = (summary.externalActions ?? {});
summary.externalActions = { bloggerLookup: (prior.bloggerLookup ?? 0) + records.reduce((n, item) => n + item.remoteLookupCount, 0), bloggerInsert: prior.bloggerInsert ?? 0, bloggerPatch: prior.bloggerPatch ?? 0, bloggerPublish: (prior.bloggerPublish ?? 0) + records.reduce((n, item) => n + item.publishCallCount, 0) };
summary.weeklyStatus = 'NOT_READY';
summary.pdfStatus = 'NOT_GENERATED_PRIVATE';
summary.searchMetricsStatus = 'QUEUED_UNKNOWN';
summary.productionPublish = { approvedAt, records };
await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify({ records: records.map(item => ({ category: item.category, draftPostId: item.draftPostId, publishCallCount: item.publishCallCount, state: item.state, publicPostUrl: item.publicPostUrl, publishedAt: item.publishedAt, httpStatus: item.httpStatus, contentRefetch: item.postflight?.pass ?? false, searchRegistration: item.searchRegistration?.googleInspectionState ?? null, libraryRegistration: Boolean(item.libraryRegistration), pdf: item.pdf })), korea: { state: 'HOLD', reason: 'verified brokerage research unavailable; no create, patch, or publish action' }, weeklyReadiness: 'NOT_READY', externalActions: summary.externalActions, commerce: { enabled: false } }, null, 2));
async function publishingConfig() { const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8')); const base = raw.blogger; const blogId = (base.blogIdEnvironmentVariable ? process.env[base.blogIdEnvironmentVariable] ?? base.blogId : base.blogId) ?? null; const available = Boolean(blogId && (base.clientIdEnvironmentVariable && process.env[base.clientIdEnvironmentVariable]) && (base.clientSecretEnvironmentVariable && process.env[base.clientSecretEnvironmentVariable]) && (base.refreshTokenEnvironmentVariable && process.env[base.refreshTokenEnvironmentVariable])); if (!available)
    throw new Error('Blogger credentials unavailable'); return { ...base, blogId, credentialAvailable: true, publishAsDraft: true }; }
async function updateSearch(records) { const path = join(process.cwd(), 'data', 'search', '2026-10-06', 'publication-registrations.json'); const current = JSON.parse(await readFile(path, 'utf8')); const additions = records.flatMap(item => item.searchRegistration ? [item.searchRegistration] : []); const map = new Map(); for (const item of [...current, ...additions])
    map.set(item.publicationId, item); await writeFile(path, JSON.stringify([...map.values()], null, 2), 'utf8'); }
async function updateWeekly(records) { const folder = join(process.cwd(), 'data', 'operations', '2026-10-06'); await mkdir(folder, { recursive: true }); const entries = records.map(record => ({ category: record.category, issueDate: record.issueDate, publicationId: record.publicationId, verificationState: 'VERIFIED', publicationState: 'PUBLISHED', publicPostUrl: record.publicPostUrl, publishedAt: record.publishedAt, articleFingerprint: record.postflight ? fingerprint(record.postflight) : null, pdfConsistency: record.pdf.consistency, searchTrackingState: 'QUEUED', weeklyReadiness: 'NOT_READY' })); entries.push({ category: 'KOREA_MARKET', issueDate: '2026-10-06', publicationId: 'motus-korea-market-2026-10-06', verificationState: 'PARTIAL', publicationState: 'HOLD', publicPostUrl: null, publishedAt: null, articleFingerprint: null, pdfConsistency: 'NOT_AVAILABLE', searchTrackingState: 'NOT_REGISTERED', weeklyReadiness: 'NOT_READY' }); await writeFile(join(folder, 'weekly-monthly-feed.json'), JSON.stringify(entries, null, 2), 'utf8'); }
async function updateLibrary(records) { const path = join(process.cwd(), 'data', 'library', 'library.json'); const store = JSON.parse(await readFile(path, 'utf8')); for (const record of records) {
    const registration = record.libraryRegistration;
    const sourceIds = registration.sourceRefs.map(url => ensureSource(store, url, record));
    const now = record.publishedAt;
    const item = { libraryId: `library:publication:${record.publicationId.replace(/^[^:]+:/, '')}`, recordType: 'PUBLICATION', canonicalId: record.publicationId, canonicalName: record.category, displayName: record.category, aliases: [], summary: null, firstSeenAt: now, lastSeenAt: now, createdAt: now, updatedAt: now, status: 'ACTIVE', verificationStatus: 'VERIFIED', confidence: null, internalMetadata: { issueDate: record.issueDate, publishedAt: now, publicPostUrl: record.publicPostUrl, relatedEvents: registration.relatedEvents, relatedCompanies: registration.relatedCompanies, relatedThemes: registration.relatedThemes }, publicMetadata: { issueDate: record.issueDate, url: record.publicPostUrl }, sourceRefs: sourceIds, evidenceRefs: [`evidence:${short(`${record.publicationId}|${record.publicPostUrl}`)}`], originRecordIds: [record.publicationId] };
    const index = store.records.findIndex(existing => existing.canonicalId === record.publicationId);
    if (index >= 0)
        store.records[index] = item;
    else
        store.records.push(item);
    for (const target of registration.relatedEvents)
        addEdge(store, item.canonicalId, target, 'PUBLICATION_COVERS_EVENT', sourceIds, item.evidenceRefs, now);
    for (const target of registration.relatedCompanies)
        addEdge(store, item.canonicalId, target, 'PUBLICATION_COVERS_COMPANY', sourceIds, item.evidenceRefs, now);
    for (const target of registration.relatedThemes)
        addEdge(store, item.canonicalId, target, 'PUBLICATION_COVERS_THEME', sourceIds, item.evidenceRefs, now);
} store.generatedAt = new Date().toISOString(); await writeFile(path, JSON.stringify(store, null, 2), 'utf8'); await mkdir(join(process.cwd(), 'data', 'library', 'publications'), { recursive: true }); await writeFile(join(process.cwd(), 'data', 'library', 'publications', 'live-publications-2026-10-06.json'), JSON.stringify(records.map(item => item.libraryRegistration), null, 2), 'utf8'); }
function ensureSource(store, url, record) { const found = store.records.find(item => item.recordType === 'SOURCE' && item.publicMetadata?.url === url); if (found)
    return found.canonicalId; const id = `source:${short(url)}`; const now = record.publishedAt; store.records.push({ libraryId: `library:source:${id.slice(7)}`, recordType: 'SOURCE', canonicalId: id, canonicalName: new URL(url).hostname, displayName: new URL(url).hostname, aliases: [], summary: null, firstSeenAt: now, lastSeenAt: now, createdAt: now, updatedAt: now, status: 'ACTIVE', verificationStatus: 'VERIFIED', confidence: null, internalMetadata: { canonicalUrl: url }, publicMetadata: { url }, sourceRefs: [id], evidenceRefs: [], originRecordIds: [record.publicationId] }); return id; }
function addEdge(store, fromId, toId, relationshipType, sourceRefs, evidenceRefs, createdAt) { const edge = { edgeId: `edge:${short(`${fromId}|${toId}|${relationshipType}`)}`, fromId, toId, relationshipType, reason: 'published Daily editorial plan relation', createdAt, sourceRefs, evidenceRefs, originRecordIds: [fromId] }; if (!store.edges.some(item => item.edgeId === edge.edgeId))
    store.edges.push(edge); }
function short(value) { return createHash('sha256').update(value).digest('hex').slice(0, 16); }
function fingerprint(value) { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
import { assertMaintenanceWriteAllowed } from './production/maintenance-write-guard.js';
assertMaintenanceWriteAllowed('live-editorial-publish-cli');
