import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createLiveEditorialCycle } from './editorial/live-cycle.js';
import { createNextLiveCycle } from './editorial/next-live-cycle.js';
import { renderKoreaEditorialArticle } from './publishers/editorial-article.js';
import { contentFingerprint, publishApprovedLiveUnit, validateLiveContent } from './production/live-editorial-publish.js';
import { GoogleBloggerApiAdapter } from './services/blogger.js';
if (!process.argv.includes('--execute') || !process.argv.includes('--user-approved-korea'))
    throw new Error('explicit --execute --user-approved-korea flags required');
const now = new Date().toISOString();
const config = await publishingConfig();
const google = new GoogleBloggerApiAdapter();
let lookup = 0, patch = 0, insert = 0, publish = 0;
const adapter = { findMatches: async (input) => { lookup++; return google.findMatchingPosts(input, config); }, readPost: async (id) => { lookup++; return google.readPost(id, config); }, publishDraft: async (id) => { publish++; return google.publishDraftPost(id, config); }, fetchPublic: async (url) => { const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'MOTUS-Sprint4Q/1.0' } }); return { status: response.status, body: await response.text() }; } };
const current = createLiveEditorialCycle(now);
const korea = current.units.find(item => item.category === 'KOREA_MARKET');
const koreaEditorial = renderKoreaEditorialArticle(korea.viewModel);
const koreaForPublish = { ...korea, render: koreaEditorial };
const koreaId = '568850689418151231';
let initial = await adapter.readPost(koreaId);
let layoutPatchCount = 0;
let koreaRecord;
if (initial.status === 'PUBLISHED') {
    const stored = JSON.parse(await readFile(join(process.cwd(), 'data', 'live-editorial-cycle', '2026-10-06', 'korea', 'publication.json'), 'utf8'));
    if (canonical(article(koreaEditorial.html)) !== canonical(initial.content)) {
        if (!sameVerifiedKoreaFacts(initial.content, article(koreaEditorial.html), korea.viewModel))
            throw new Error('published Korea content differs beyond editorial presentation');
        patch++;
        layoutPatchCount++;
        initial = await google.patchPostContent(koreaId, { title: korea.title, content: koreaEditorial.html, labels: [koreaEditorial.label] }, config);
    }
    const validation = validateLiveContent(koreaForPublish, initial, koreaId, 'PUBLISHED');
    if (!validation.pass || !initial.url || stored.state !== 'PUBLISHED' || stored.publicPostUrl !== initial.url)
        throw new Error('existing Korea publication recovery validation failed');
    const page = await adapter.fetchPublic(initial.url);
    if (page.status !== 200 || !page.body.includes(korea.title))
        throw new Error('existing Korea public page recovery validation failed');
    koreaRecord = { ...stored, postflight: validation, audit: [...stored.audit, ...(layoutPatchCount ? [{ at: now, event: 'EDITORIAL_FIRST_PATCH', detail: 'Published content changed to editorial-first prose using the same verified facts and sources; no publish call' }] : [])] };
}
else {
    if (initial.status !== 'DRAFT')
        throw new Error(`Korea target is not DRAFT: ${initial.status}`);
    if (initial.title !== korea.title || !initial.labels.includes(korea.render.label))
        throw new Error('Korea draft identity mismatch');
    if (canonical(article(koreaEditorial.html)) !== canonical(initial.content)) {
        if (!sameVerifiedKoreaFacts(initial.content, article(koreaEditorial.html), korea.viewModel))
            throw new Error('Korea draft differs beyond editorial presentation');
        patch++;
        layoutPatchCount++;
        await google.patchPostContent(koreaId, { title: korea.title, content: koreaEditorial.html, labels: [koreaEditorial.label] }, config);
    }
    koreaRecord = await publishApprovedLiveUnit({ unit: koreaForPublish, draftPostId: koreaId, approvedAt: now, adapter });
    if (koreaRecord.state !== 'PUBLISHED')
        throw new Error(`Korea publish blocked: ${koreaRecord.error}`);
}
const koreaRoot = join(process.cwd(), 'data', 'live-editorial-cycle', '2026-10-06', 'korea');
await writeFile(join(koreaRoot, 'publication.json'), JSON.stringify({ ...koreaRecord, prePublishLayoutPatchCount: layoutPatchCount }, null, 2), 'utf8');
await updateCurrentOperation(koreaRecord, layoutPatchCount);
await registerKorea(koreaRecord);
const next = createNextLiveCycle(now);
const nextRoot = join(process.cwd(), 'data', 'live-editorial-cycle', '2026-10-07');
await mkdir(nextRoot, { recursive: true });
const nextRecords = [];
for (const unit of next.units.filter(item => item.category !== 'KOREA_MARKET')) {
    const folder = unit.category === 'AI_INTELLIGENCE' ? 'ai' : 'us';
    const labels = [unit.label, ...unit.labelAliases];
    const found = [];
    for (const label of labels) {
        const matches = await google.findMatchingPosts({ title: unit.title, label }, config);
        lookup++;
        for (const match of matches)
            if (!found.some(item => item.postId === match.postId))
                found.push(match);
    }
    const exact = found.filter(item => item.title === unit.title);
    let post;
    let inserted = 0;
    if (exact.length) {
        post = exact[0];
        if (exact.length === 1 && !post.labels.includes(unit.label)) {
            patch++;
            post = await google.patchPostContent(post.postId, { title: unit.title, content: unit.render.html, labels: [unit.label] }, config);
        }
    }
    else {
        insert++;
        inserted = 1;
        post = await google.insertDraftContent({ title: unit.title, content: unit.render.html, labels: [unit.label] }, config);
    }
    const validation = validateNext(unit, post);
    const state = exact.length <= 1 && post.status === 'DRAFT' && validation.pass ? 'DRAFT' : 'HOLD';
    const record = { publicationId: unit.publicationId, category: unit.category, issueDate: unit.issueDate, title: unit.title, canonicalLabel: unit.canonicalLabel, label: unit.label, state, draftPostId: post.postId, publicPostUrl: null, remoteDuplicateCount: Math.max(0, exact.length - 1), postsInsertCount: inserted, publishCount: 0, humanReviewState: state === 'DRAFT' ? 'APPROVAL_REQUIRED' : 'HOLD', coverage: unit.coverage, sourceCount: unit.sourceCount, itemCount: unit.itemCount, validation, contentFingerprint: contentFingerprint(post.content), searchRegistration: null, pdf: { state: 'NOT_GENERATED', visibility: 'PRIVATE' }, commerce: { enabled: false } };
    const path = join(nextRoot, folder);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'preview.html'), unit.render.html, 'utf8');
    await writeFile(join(path, 'publication.json'), JSON.stringify(record, null, 2), 'utf8');
    nextRecords.push(record);
}
const koreaNext = next.units.find(item => item.category === 'KOREA_MARKET');
const koreaNextPath = join(nextRoot, 'korea');
await mkdir(koreaNextPath, { recursive: true });
await writeFile(join(koreaNextPath, 'publication.json'), JSON.stringify({ ...koreaNext, state: 'REVIEW_READY', humanReviewState: 'APPROVAL_REQUIRED', draftPostId: null, publicPostUrl: null, publishCount: 0, postsInsertCount: 0, searchRegistration: null, pdf: { state: 'NOT_GENERATED', visibility: 'PRIVATE' }, commerce: { enabled: false } }, null, 2), 'utf8');
const menu = await analyzeMenu();
const summary = { generatedAt: now, currentKorea: { ...koreaRecord, prePublishLayoutPatchCount: layoutPatchCount }, nextDaily: { records: nextRecords, korea: koreaNext }, bloggerCategoryAnalysis: menu, cadenceKst: { US_MARKET: '06:30-07:00', AI_INTELLIGENCE: '12:00-13:00', KOREA_MARKET: '17:00-18:00' }, weeklyReadiness: 'NOT_READY', pdf: { distribution: 'PRIVATE', candidates: next.pdfCandidates }, search: { providerState: 'NOT_CONFIGURED', metricsGenerated: false }, actions: { lookup, insert, patch, publish, themeMutation: 0, menuMutation: 0 }, commerce: { enabled: false } };
await writeFile(join(nextRoot, 'run-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
async function updateCurrentOperation(record, layoutPatchCount) { const path = join(koreaRoot, 'operation.json'); const value = JSON.parse(await readFile(path, 'utf8')); Object.assign(value, { humanReviewState: 'APPROVED', reviewer: 'human', approvedAt: now, reviewProvenance: 'USER_EXPLICIT_OPERATION_INSTRUCTION', draftState: record.state, publicPostUrl: record.publicPostUrl, publishedAt: record.publishedAt, publishCount: record.publishCallCount, prePublishLayoutPatchCount: layoutPatchCount, searchRegistration: record.searchRegistration, pdf: record.pdf, audit: record.audit }); await writeFile(path, JSON.stringify(value, null, 2), 'utf8'); }
async function registerKorea(record) { const searchDir = join(process.cwd(), 'data', 'search', '2026-10-07'); await mkdir(searchDir, { recursive: true }); await writeFile(join(searchDir, 'publication-registrations.json'), JSON.stringify(record.searchRegistration ? [record.searchRegistration] : [], null, 2), 'utf8'); const feedDir = join(process.cwd(), 'data', 'operations', '2026-10-07'); await mkdir(feedDir, { recursive: true }); const feed = [{ category: record.category, issueDate: record.issueDate, publicationId: record.publicationId, verificationState: 'VERIFIED', publicationState: 'PUBLISHED', publicPostUrl: record.publicPostUrl, publishedAt: record.publishedAt, articleFingerprint: record.postflight ? hash(record.postflight) : null, pdfConsistency: record.pdf.consistency, searchTrackingState: 'QUEUED', weeklyReadiness: 'NOT_READY' }]; await writeFile(join(feedDir, 'weekly-monthly-feed.json'), JSON.stringify(feed, null, 2), 'utf8'); const path = join(process.cwd(), 'data', 'library', 'publications', 'live-publications-2026-10-06.json'); const prior = JSON.parse(await readFile(path, 'utf8')); const entry = record.libraryRegistration; const merged = [...prior.filter(Boolean), entry].filter((item, index, all) => all.findIndex(other => other?.publicationId === item?.publicationId) === index); await writeFile(path, JSON.stringify(merged, null, 2), 'utf8'); await registerCoreLibrary(record); }
async function registerCoreLibrary(record) { const registration = record.libraryRegistration; if (!registration || !record.publishedAt)
    return; const path = join(process.cwd(), 'data', 'library', 'library.json'); const store = JSON.parse(await readFile(path, 'utf8')); const sourceIds = registration.sourceRefs.map(url => ensureLibrarySource(store, url, record)); const item = { libraryId: `library:publication:${record.publicationId.replace(/^[^:]+:/, '')}`, recordType: 'PUBLICATION', canonicalId: record.publicationId, canonicalName: record.category, displayName: record.category, aliases: [], summary: null, firstSeenAt: record.publishedAt, lastSeenAt: record.publishedAt, createdAt: record.publishedAt, updatedAt: record.publishedAt, status: 'ACTIVE', verificationStatus: 'VERIFIED', confidence: null, internalMetadata: { issueDate: record.issueDate, publishedAt: record.publishedAt, publicPostUrl: record.publicPostUrl, relatedEvents: registration.relatedEvents, relatedCompanies: registration.relatedCompanies, relatedThemes: registration.relatedThemes }, publicMetadata: { issueDate: record.issueDate, url: record.publicPostUrl }, sourceRefs: sourceIds, evidenceRefs: [`evidence:${short(`${record.publicationId}|${record.publicPostUrl}`)}`], originRecordIds: [record.publicationId] }; const index = store.records.findIndex(existing => existing.canonicalId === record.publicationId); if (index >= 0)
    store.records[index] = item;
else
    store.records.push(item); for (const target of registration.relatedEvents)
    addLibraryEdge(store, item.canonicalId, target, 'PUBLICATION_COVERS_EVENT', sourceIds, item.evidenceRefs, record.publishedAt); for (const target of registration.relatedCompanies)
    addLibraryEdge(store, item.canonicalId, target, 'PUBLICATION_COVERS_COMPANY', sourceIds, item.evidenceRefs, record.publishedAt); for (const target of registration.relatedThemes)
    addLibraryEdge(store, item.canonicalId, target, 'PUBLICATION_COVERS_THEME', sourceIds, item.evidenceRefs, record.publishedAt); store.generatedAt = now; await writeFile(path, JSON.stringify(store, null, 2), 'utf8'); }
function ensureLibrarySource(store, url, record) { const found = store.records.find(item => item.recordType === 'SOURCE' && item.publicMetadata?.url === url); if (found)
    return found.canonicalId; const id = `source:${short(url)}`; const at = record.publishedAt; store.records.push({ libraryId: `library:source:${id.slice(7)}`, recordType: 'SOURCE', canonicalId: id, canonicalName: new URL(url).hostname, displayName: new URL(url).hostname, aliases: [], summary: null, firstSeenAt: at, lastSeenAt: at, createdAt: at, updatedAt: at, status: 'ACTIVE', verificationStatus: 'VERIFIED', confidence: null, internalMetadata: { canonicalUrl: url }, publicMetadata: { url }, sourceRefs: [id], evidenceRefs: [], originRecordIds: [record.publicationId] }); return id; }
function addLibraryEdge(store, fromId, toId, relationshipType, sourceRefs, evidenceRefs, createdAt) { const edge = { edgeId: `edge:${short(`${fromId}|${toId}|${relationshipType}`)}`, fromId, toId, relationshipType, reason: 'published Daily editorial plan relation', createdAt, sourceRefs, evidenceRefs, originRecordIds: [fromId] }; if (!store.edges.some(item => item.edgeId === edge.edgeId))
    store.edges.push(edge); }
function validateNext(unit, post) { const html = post.content; const visibleText = visible(html); const anchors = [...html.matchAll(/<a\b[^>]*href=["']https?:\/\/[^"']+["']/gi)].length; const forbidden = ['왜 중요한가', '무슨 일이 있었나', '산업 연결', '시장 연결', '핵심 내용'].some(label => new RegExp(`>${label}<`).test(html)); const svgCount = (html.match(/<svg\b/gi) ?? []).length; const checks = { postId: Boolean(post.postId), state: post.status === 'DRAFT', title: post.title === unit.title, label: post.labels.includes(unit.label), fingerprint: canonical(article(unit.render.html)) === canonical(html), sourceAnchors: anchors >= unit.sourceCount, rawUrlSafe: !/(?:https?:\/\/)[^\s<]+/i.test(visibleText), internalSafe: !/(?:eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore)/i.test(html), fixtureSafe: !/(?:fixture|sample marker|SAMPLE · PREVIEW)/i.test(html), mobile: /overflow-x\s*:\s*hidden/i.test(html) && /max-width\s*:\s*100%/i.test(html), forbiddenLabelsAbsent: !forbidden, commerceDisabled: !/(?:affiliate|제휴|광고|commerce)/i.test(html), chart: unit.category !== 'US_MARKET' || svgCount === 4 }; return { ...checks, svgCount, pass: Object.values(checks).every(Boolean) }; }
async function analyzeMenu() { const response = await fetch(config.publicBaseUrl ?? 'https://motusnova.blogspot.com/', { headers: { 'user-agent': 'MOTUS-Menu-Audit/1.0' } }); const html = await response.text(); const labels = [...html.matchAll(/\/search\/label\/([^"'?#]+)/gi)].map(match => decodeURIComponent(match[1].replace(/\+/g, ' '))); return { httpStatus: response.status, currentLabels: [...new Set(labels)].sort(), proposedMenu: ['AI 인텔리전스', '미국증시', '국내증시', '주간 인텔리전스', '월간 인텔리전스', '리포트', 'MOTUS 소개'], menuReadiness: response.ok ? 'PLAN_READY_BACKUP_REQUIRED' : 'HOLD', themeMutationCount: 0, menuMutationCount: 0 }; }
async function publishingConfig() { const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8')); const base = raw.blogger; const blogId = (base.blogIdEnvironmentVariable ? process.env[base.blogIdEnvironmentVariable] ?? base.blogId : base.blogId) ?? null; if (!blogId || !base.clientIdEnvironmentVariable || !process.env[base.clientIdEnvironmentVariable] || !base.clientSecretEnvironmentVariable || !process.env[base.clientSecretEnvironmentVariable] || !base.refreshTokenEnvironmentVariable || !process.env[base.refreshTokenEnvironmentVariable])
    throw new Error('Blogger credentials unavailable'); return { ...base, blogId, credentialAvailable: true, publishAsDraft: true }; }
function article(html) { const match = html.match(/<article\b[^>]*>[\s\S]*<\/article>/i); if (!match)
    throw new Error('article missing'); return match[0]; }
function canonical(html) { return html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim(); }
function visible(html) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function sourceSet(html) { return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(match => match[1]).sort().join('|'); }
function hash(value) { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
function short(value) { return createHash('sha256').update(value).digest('hex').slice(0, 16); }
function sameVerifiedKoreaFacts(currentHtml, nextHtml, view) { if (sourceSet(currentHtml) !== sourceSet(nextHtml))
    return false; const currentText = visible(currentHtml); const nextText = visible(nextHtml); const required = [...view.indexMetrics, ...view.fxAndSupporting, ...view.investorFlows, ...view.sectors, ...view.movers].flatMap(item => [item.label, item.displayValue]); return required.every(value => currentText.includes(value) && nextText.includes(value)); }
import { assertMaintenanceWriteAllowed } from './production/maintenance-write-guard.js';
assertMaintenanceWriteAllowed('sprint4q-cli');
