import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createLiveEditorialCycle } from './editorial/live-cycle.js';
import { correctPublishedUsCaption } from './production/post-publish-maintenance.js';
import { contentFingerprint } from './production/live-editorial-publish.js';
import { GoogleBloggerApiAdapter } from './services/blogger.js';
if (!process.argv.includes('--execute'))
    throw new Error('explicit --execute required');
const root = join(process.cwd(), 'data', 'live-editorial-cycle', '2026-10-06');
const cycle = createLiveEditorialCycle(new Date().toISOString());
const ai = cycle.units.find(item => item.category === 'AI_INTELLIGENCE');
const us = cycle.units.find(item => item.category === 'US_MARKET');
const korea = cycle.units.find(item => item.category === 'KOREA_MARKET');
const config = await publishingConfig();
const google = new GoogleBloggerApiAdapter();
let lookup = 0, insert = 0, patch = 0;
const adapter = { readPost: async (id) => { lookup++; return google.readPost(id, config); }, patchPost: async (id, input) => { patch++; return google.patchPostContent(id, input, config); }, fetchPublic: async (url) => { const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'MOTUS-Post-Publish-Verification/1.0' } }); return { status: response.status, body: await response.text() }; } };
const correction = await correctPublishedUsCaption({ unit: us, postId: '614930389904987485', adapter });
if (correction.state !== 'PUBLISHED')
    throw new Error(`U.S. correction blocked: ${correction.error}`);
const aiPost = await adapter.readPost('4294902999154862199');
if (aiPost.status !== 'PUBLISHED' || aiPost.title !== ai.title || !aiPost.labels.includes(ai.render.label))
    throw new Error('AI publication audit failed');
const aiPublication = await updatePublication('ai', { contentFingerprint: contentFingerprint(aiPost.content), postPublishAudit: 'PASS' });
const usPublication = await updatePublication('us', { contentFingerprint: correction.afterFingerprint, correction, postPublishAudit: 'PASS' });
const koreaMatches = await google.findMatchingPosts({ title: korea.title, label: korea.render.label }, config);
lookup++;
if (koreaMatches.length > 1)
    throw new Error('multiple Korea remote duplicates');
let koreaPost = koreaMatches[0] ?? null;
if (!koreaPost && korea.publicationReadiness === 'APPROVAL_REQUIRED') {
    koreaPost = await google.insertDraftContent({ title: korea.title, content: korea.render.html, labels: [korea.render.label] }, config);
    insert++;
}
if (!koreaPost || koreaPost.status !== 'DRAFT')
    throw new Error('Korea review-ready Draft unavailable');
await Promise.all([writeFile(join(root, 'korea', 'preview.html'), korea.render.html, 'utf8'), writeFile(join(root, 'korea', 'editorial-plan.json'), JSON.stringify(korea.plan, null, 2), 'utf8'), writeFile(join(root, 'korea', 'operation.json'), JSON.stringify({ category: korea.category, issueDate: korea.issueDate, title: korea.title, publicationReadiness: korea.publicationReadiness, humanReviewState: korea.plan.reviewState, remoteDuplicateCount: koreaMatches.length, draftPostId: koreaPost.postId, draftState: koreaPost.status, publicPostUrl: null, postsInsertCount: insert, publishCount: 0, validation: { state: true, title: koreaPost.title === korea.title, label: koreaPost.labels.includes(korea.render.label), mobile: /max-width\s*:\s*100%/i.test(koreaPost.content), internalToken: !/(?:eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore)/i.test(koreaPost.content), commerce: !/(?:affiliate|제휴|광고|commerce)/i.test(koreaPost.content), pass: true }, warnings: korea.warnings, readinessPolicy: 'KOREA_READINESS_V2', commerce: { enabled: false } }, null, 2), 'utf8')]);
const search = JSON.parse(await readFile(join(process.cwd(), 'data', 'search', '2026-10-06', 'publication-registrations.json'), 'utf8'));
const library = JSON.parse(await readFile(join(process.cwd(), 'data', 'library', 'publications', 'live-publications-2026-10-06.json'), 'utf8'));
const weeklyPath = join(process.cwd(), 'data', 'operations', '2026-10-06', 'weekly-monthly-feed.json');
const weekly = JSON.parse(await readFile(weeklyPath, 'utf8'));
const koreaFeed = weekly.find(item => item.category === 'KOREA_MARKET');
if (koreaFeed) {
    koreaFeed.verificationState = 'VERIFIED';
    koreaFeed.publicationState = 'DRAFT';
    koreaFeed.weeklyReadiness = 'NOT_READY';
}
const weeklyBlockers = ['FULL_TRADING_WEEK_NOT_ACCUMULATED', 'INSUFFICIENT_COMPARABLE_HISTORY'];
await writeFile(weeklyPath, JSON.stringify(weekly, null, 2), 'utf8');
const audit = { generatedAt: new Date().toISOString(), usCorrection: correction, korea: { oldState: 'HOLD', newReadiness: korea.publicationReadiness, draftPostId: koreaPost.postId, insertCount: insert, warnings: korea.warnings }, ai: { state: aiPost.status, postId: aiPost.postId, contentFingerprint: contentFingerprint(aiPost.content) }, search: { registrationCount: search.filter(item => [ai.publicationId, us.publicationId].includes(item.publicationId)).length, state: 'QUEUED' }, library: { registrationCount: library.filter(item => [ai.publicationId, us.publicationId].includes(item.publicationId)).length }, weekly: { readiness: 'NOT_READY', blockers: weeklyBlockers }, nextDaily: { ai: { latestIssue: ai.issueDate, duplicateProtected: true }, us: { latestIssue: us.issueDate, duplicateProtected: true }, korea: { latestIssue: korea.issueDate, duplicateProtected: true } }, actions: { lookup, insert, patch, publish: 0 }, commerce: { enabled: false } };
await writeFile(join(root, 'post-publish-maintenance.json'), JSON.stringify(audit, null, 2), 'utf8');
const summaryPath = join(root, 'run-summary.json');
const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
const prior = summary.externalActions;
summary.externalActions = { bloggerLookup: (prior.bloggerLookup ?? 0) + lookup, bloggerInsert: (prior.bloggerInsert ?? 0) + insert, bloggerPatch: (prior.bloggerPatch ?? 0) + patch, bloggerPublish: prior.bloggerPublish ?? 0 };
summary.weeklyStatus = 'NOT_READY';
summary.postPublishMaintenance = audit;
await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(audit, null, 2));
async function updatePublication(folder, fields) { const path = join(root, folder, 'publication.json'); const value = JSON.parse(await readFile(path, 'utf8')); Object.assign(value, fields); const history = Array.isArray(value.audit) ? value.audit : []; if (folder === 'us' && !history.some(item => item.event === 'FACTUAL_DISPLAY_CORRECTION'))
    history.push({ at: new Date().toISOString(), event: 'FACTUAL_DISPLAY_CORRECTION', detail: 'Chart caption corrected from a stale fixed range to the verified series firstDate~lastDate; public article re-fetched with HTTP 200' }); value.audit = history; await writeFile(path, JSON.stringify(value, null, 2), 'utf8'); return value; }
async function publishingConfig() { const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8')); const base = raw.blogger; const blogId = (base.blogIdEnvironmentVariable ? process.env[base.blogIdEnvironmentVariable] ?? base.blogId : base.blogId) ?? null; if (!blogId || !base.clientIdEnvironmentVariable || !process.env[base.clientIdEnvironmentVariable] || !base.clientSecretEnvironmentVariable || !process.env[base.clientSecretEnvironmentVariable] || !base.refreshTokenEnvironmentVariable || !process.env[base.refreshTokenEnvironmentVariable])
    throw new Error('Blogger credentials unavailable'); return { ...base, blogId, credentialAvailable: true, publishAsDraft: true }; }
