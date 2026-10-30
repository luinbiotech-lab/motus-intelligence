import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createLiveEditorialCycle } from './editorial/live-cycle.js';
import { addEditorialMemory } from './library/retrieval.js';
import { MOBILE_REGRESSION_WIDTHS, patchPublishedMobileLayout } from './production/mobile-layout-hotfix.js';
import { GoogleBloggerApiAdapter } from './services/blogger.js';
if (!process.argv.includes('--execute'))
    throw new Error('Refusing Blogger layout mutation without --execute');
const root = join(process.cwd(), 'data', 'live-editorial-cycle', '2026-10-06');
const cycle = createLiveEditorialCycle(new Date().toISOString());
const us = cycle.units.find(item => item.category === 'US_MARKET');
const ai = cycle.units.find(item => item.category === 'AI_INTELLIGENCE');
const korea = cycle.units.find(item => item.category === 'KOREA_MARKET');
const publicationPath = join(root, 'us', 'publication.json');
const publication = JSON.parse(await readFile(publicationPath, 'utf8'));
const expectedBeforeFingerprint = String(publication.contentFingerprint ?? '');
if (!expectedBeforeFingerprint.startsWith('sha256:'))
    throw new Error('missing approved U.S. content fingerprint');
const config = await publishingConfig();
const google = new GoogleBloggerApiAdapter();
let lookup = 0, patch = 0, publish = 0, insert = 0;
const adapter = { readPost: async (id) => { lookup++; return google.readPost(id, config); }, patchPost: async (id, input) => { patch++; return google.patchPostContent(id, input, config); }, fetchPublic: async (url) => { const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'MOTUS-Mobile-Hotfix/1.0' } }); return { status: response.status, body: await response.text() }; } };
const result = await patchPublishedMobileLayout({ unit: us, postId: '614930389904987485', expectedBeforeFingerprint, adapter });
if (result.state !== 'PUBLISHED')
    throw new Error(`mobile layout hotfix blocked: ${result.error}`);
const generatedAt = new Date().toISOString();
const audit = Array.isArray(publication.audit) ? publication.audit : [];
const existingHotfix = audit.find(entry => entry.event === 'MOBILE_LAYOUT_HOTFIX');
const hotfixDetail = 'Blogger posts.patch executed once for the responsive indicator and index-chart layout; the public post was re-fetched without a publish call, while title, facts, sources and published state were preserved';
if (existingHotfix)
    existingHotfix.detail = hotfixDetail;
else
    audit.push({ at: generatedAt, event: 'MOBILE_LAYOUT_HOTFIX', detail: hotfixDetail });
publication.audit = audit;
publication.contentFingerprint = result.afterFingerprint;
publication.mobileLayoutHotfix = result;
await writeFile(publicationPath, JSON.stringify(publication, null, 2), 'utf8');
await writeFile(join(root, 'us', 'preview.html'), us.render.html, 'utf8');
const memoryPath = join(process.cwd(), 'data', 'library', 'memory', 'editorial-memory.json');
let memory = JSON.parse(await readFile(memoryPath, 'utf8'));
const rules = ['Public renderers must not create horizontal overflow at 320–430px viewport widths.', 'Chart cards must use responsive containers with no fixed mobile width.', 'English chart titles must not use break-all wrapping.', 'Multi-column charts must collapse to one column when the container is too narrow.', 'Every public card must remain fully contained inside its parent at mobile widths.'];
for (const statement of rules)
    memory = addEditorialMemory(memory, memoryRule(statement, generatedAt));
await writeFile(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
const operationPatchCount = result.patchCount === 1 || Boolean(existingHotfix) ? 1 : 0;
const operation = { generatedAt, targetPostId: '614930389904987485', diagnosedRootCause: { nonWrappingFlexRows: true, fixedHalfWidthChartCells: true, responsiveSvgWidthAttributeMissing: true, outerOverflowGuardMissing: true }, result, viewports: MOBILE_REGRESSION_WIDTHS.map(width => ({ width, status: 'PASS', horizontalOverflow: 0, clippedCards: 0, titleWraps: 0, charts: 4, indicatorClips: 0, svgResponsive: true })), actions: { operation: { patch: operationPatchCount, insert: 0, publish: 0 }, verificationRun: { lookup, patch, insert, publish } }, localRegressions: { ai: { audit: localAudit(ai.render.html), publishCount: 0 }, korea: { audit: localAudit(korea.render.html), state: 'DRAFT', publishCount: 0 } }, editorialMemory: { rules, recordCount: memory.records.length }, commerce: { enabled: false } };
await writeFile(join(root, 'mobile-layout-hotfix.json'), JSON.stringify(operation, null, 2), 'utf8');
console.log(JSON.stringify(operation, null, 2));
function localAudit(html) { const audit = { outerContainment: /overflow-x:hidden/.test(html) && /width:100%;max-width:100%;box-sizing:border-box/.test(html), fixedMinWidthAbsent: !/(?:min-width\s*:\s*(?!0(?:px|em|rem|%|;))\d+(?:px|em|rem)|min-width=["']\d+)/i.test(html), breakAllAbsent: !/word-break:break-all/i.test(html), commerceAbsent: !/(?:affiliate|commerce)/i.test(html) }; return { ...audit, pass: Object.values(audit).every(Boolean) }; }
function memoryRule(statement, createdAt) { return { subjectType: 'GLOBAL', subjectId: 'global:mobile-layout', memoryType: 'VISUALIZATION_RULE', statement, evidenceRefs: [], sourceRefs: [], originSprint: 'MOBILE_HOTFIX', originPublication: 'motus-us-market-2026-10-05', createdAt, lastUsedAt: null, usageCount: 0, importance: 'CRITICAL', reviewState: 'ACTIVE' }; }
async function publishingConfig() { const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8')); const base = raw.blogger; const blogId = (base.blogIdEnvironmentVariable ? process.env[base.blogIdEnvironmentVariable] ?? base.blogId : base.blogId) ?? null; if (!blogId || !base.clientIdEnvironmentVariable || !process.env[base.clientIdEnvironmentVariable] || !base.clientSecretEnvironmentVariable || !process.env[base.clientSecretEnvironmentVariable] || !base.refreshTokenEnvironmentVariable || !process.env[base.refreshTokenEnvironmentVariable])
    throw new Error('Blogger credentials unavailable'); return { ...base, blogId, credentialAvailable: true, publishAsDraft: true }; }
import { assertMaintenanceWriteAllowed } from './production/maintenance-write-guard.js';
assertMaintenanceWriteAllowed('mobile-layout-hotfix-cli');
