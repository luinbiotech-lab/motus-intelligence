import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ManualNaverSearchAdvisorAdapter, NotConfiguredGoogleSearchConsoleAdapter, auditArticleSEO, buildSearchOperatorPackage, redactSecret, registerPublishedArticle } from './search/measurement.js';
const args = process.argv.slice(2);
const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const runDate = value('--date') ?? new Date().toISOString().slice(0, 10);
const provider = value('--provider') ?? 'all';
if (!['all', 'google', 'naver'].includes(provider))
    throw new Error('provider must be google, naver, or all');
const outputRoot = join(process.cwd(), 'data', 'search', runDate);
const publicationPath = join(process.cwd(), 'data', 'blogger', '2026-09-29', 'newsletter-motus-2026-09-29-publication.json');
const publication = JSON.parse(await readFile(publicationPath, 'utf8'));
const publications = publication.status === 'PUBLISHED' && publication.publicPostUrl ? [publication] : [];
const visibility = publications.map(item => registerPublishedArticle(item.reportId, item.publicPostUrl));
const seo = publications.map(item => auditArticleSEO({ publicationId: item.reportId, url: item.publicPostUrl, title: item.title, metaDescription: item.metaDescription, canonicalUrl: item.publicPostUrl, html: item.html }));
const generatedAt = new Date().toISOString();
const sitemap = { url: 'https://motusnova.blogspot.com/sitemap.xml', status: 'UNKNOWN', lastCheckedAt: generatedAt, httpStatus: null, entryCount: null, lastModified: null, submissionState: 'UNKNOWN', provenance: 'network verification not requested in read-only foundation run' };
const rss = { url: 'https://motusnova.blogspot.com/feeds/posts/default', status: 'UNKNOWN', lastCheckedAt: generatedAt, httpStatus: null, entryCount: null, lastModified: null, submissionState: 'UNKNOWN', provenance: 'network verification not requested in read-only foundation run' };
const google = new NotConfiguredGoogleSearchConsoleAdapter();
const naver = new ManualNaverSearchAdvisorAdapter();
const naverStatus = await naver.getStatus('https://motusnova.blogspot.com/');
const searchOperator = buildSearchOperatorPackage({ generatedAt, googleState: google.connectionState, naverState: naver.connectionState, sitemap, rss, publications: publications.map(item => ({ publicationId: item.reportId })), visibility, records: [], seo });
const credentialAudit = { googleClientId: redactSecret(process.env.SEARCH_CONSOLE_CLIENT_ID), googleClientSecret: redactSecret(process.env.SEARCH_CONSOLE_CLIENT_SECRET), googleRefreshToken: redactSecret(process.env.SEARCH_CONSOLE_REFRESH_TOKEN), naverKey: redactSecret(process.env.NAVER_SEARCH_ADVISOR_KEY) };
await Promise.all(['google', 'naver', 'seo'].map(folder => mkdir(join(outputRoot, folder), { recursive: true })));
await Promise.all([
    writeFile(join(outputRoot, 'search-operator.json'), JSON.stringify({ ...searchOperator, request: { provider, dateRange: value('--date-range') ?? null, publication: value('--publication') ?? null, dryRun: true, audit: args.includes('--audit') }, credentialAudit }, null, 2), 'utf8'),
    writeFile(join(outputRoot, 'google', 'analytics.json'), JSON.stringify({ state: 'NOT_CONFIGURED', records: [], zeroMetrics: false, reason: 'credential/property connection not configured; unknown is not converted to zero' }, null, 2), 'utf8'),
    writeFile(join(outputRoot, 'google', 'inspection.json'), JSON.stringify({ state: 'NOT_CONFIGURED', queue: visibility.map(item => ({ publicationId: item.publicationId, url: item.publicPostUrl, status: 'PENDING_CONFIGURATION' })), results: [] }, null, 2), 'utf8'),
    writeFile(join(outputRoot, 'google', 'sitemaps.json'), JSON.stringify({ state: 'NOT_CONFIGURED', records: [sitemap] }, null, 2), 'utf8'),
    writeFile(join(outputRoot, 'naver', 'status.json'), JSON.stringify({ state: naver.connectionState, status: naverStatus, candidates: { sitemap: sitemap.url, rss: rss.url }, indexNow: { enabled: false, calls: 0 } }, null, 2), 'utf8'),
    writeFile(join(outputRoot, 'seo', 'article-audit.json'), JSON.stringify(seo, null, 2), 'utf8')
]);
console.log(JSON.stringify({ runDate, provider, google: google.connectionState, naver: naver.connectionState, publishedArticles: publications.length, metricsCollected: 0, indexNowCalls: 0, googleIndexingCalls: 0, bloggerCalls: 0, outputRoot }, null, 2));
