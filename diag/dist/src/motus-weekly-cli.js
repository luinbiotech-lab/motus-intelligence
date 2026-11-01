/**
 * Weekly review production: collect → build → gate → publish exactly once per reviewed week.
 *
 *   node dist/src/motus-weekly-cli.js --date YYYY-MM-DD [--execute] [--final-attempt]
 *
 * Without --execute (or without MOTUS_LIVE_PUBLISH_ENABLED=true) nothing is sent to Blogger. A week is published
 * at most once: the persisted ledger (data/weekly/<weekStart>/publish-ledger.jsonl), the public label feed and the
 * Blogger title lookup are all checked first, and an earlier draft of the same week is reused instead of a new post.
 * The first attempt of a week requires next week's economic calendar; --final-attempt accepts broker outlook alone.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildWeeklyArticle, collectWeeklyEvidence, weekWindow } from './operations/weekly-review.js';
import { renderWeeklyEditorialArticle } from './publishers/editorial-article.js';
import { GoogleBloggerApiAdapter, isPublicBloggerPostUrl } from './services/blogger.js';
export const WEEKLY_LABEL = '주간 증시';
const args = process.argv.slice(2), value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const kstToday = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const runDate = value('--date') ?? kstToday;
if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate))
    throw new Error('--date YYYY-MM-DD required');
const execute = args.includes('--execute'), finalAttempt = args.includes('--final-attempt');
const window = weekWindow(runDate), root = join(process.cwd(), 'data', 'weekly', window.weekStart), identity = `weekly|${window.weekStart}`;
await mkdir(root, { recursive: true });
const ledgerPath = join(root, 'publish-ledger.jsonl');
const ledger = async () => { try {
    return (await readFile(ledgerPath, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(item => item.identity === identity);
}
catch {
    return [];
} };
const record = async (entry) => appendFile(ledgerPath, JSON.stringify({ identity, at: new Date().toISOString(), ...entry }) + '\n', 'utf8');
const done = async (result) => {
    await writeFile(join(root, 'weekly-publish.json'), JSON.stringify({ identity, runDate, ...result }, null, 2), 'utf8');
    console.log(JSON.stringify({ identity, ...result }));
    const failed = execute && process.env.MOTUS_LIVE_PUBLISH_ENABLED === 'true' && (result.state === 'FAILED' || (result.state === 'HOLD' && finalAttempt));
    process.exit(failed ? 1 : 0);
};
// A week already published needs no collection at all.
const prior = await ledger(), published = prior.find(item => item.event === 'PUBLISHED' || item.event === 'SKIPPED_EXISTING');
if (published && execute)
    await done({ state: 'SKIP', reason: 'this week is already published', postId: published.postId, publicPostUrl: published.publicPostUrl });
const evidence = await collectWeeklyEvidence(runDate);
await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
const article = buildWeeklyArticle(evidence, { requireCalendar: !finalAttempt });
const render = renderWeeklyEditorialArticle(article), html = render.html.replace('<article ', `<article data-week="${window.weekStart}" `);
await writeFile(join(root, 'weekly-article.json'), JSON.stringify(article, null, 2), 'utf8');
await writeFile(join(root, 'weekly-article.html'), html, 'utf8');
if (article.readiness !== 'READY')
    await done({ state: 'HOLD', reasons: article.reasons, title: article.title, publishCallCount: 0 });
if (!execute || process.env.MOTUS_LIVE_PUBLISH_ENABLED !== 'true')
    await done({ state: 'SIMULATED', title: article.title, sections: render.renderedSections, publishCallCount: 0 });
if (process.env.GITHUB_ACTIONS === 'true' && !existsSync(join(process.cwd(), 'data', '.ops-data-hydrated')))
    await done({ state: 'HOLD', reasons: ['OPS_DATA_NOT_HYDRATED'], publishCallCount: 0 });
const missing = ['BLOGGER_BLOG_ID', 'BLOGGER_CLIENT_ID', 'BLOGGER_CLIENT_SECRET', 'BLOGGER_REFRESH_TOKEN'].filter(key => !process.env[key]?.trim());
if (missing.length)
    await done({ state: 'HOLD', reasons: ['BLOGGER_CREDENTIALS_MISSING'], publishCallCount: 0 });
// Public label feed: a post of this week that the ledger does not know about (e.g. a lost persistence run).
try {
    const response = await fetch(`https://motusnova.blogspot.com/feeds/posts/default/-/${encodeURIComponent(WEEKLY_LABEL)}?alt=json&max-results=10`, { signal: AbortSignal.timeout(20000) });
    if (response.ok) {
        const body = await response.json();
        const hit = (body.feed?.entry ?? []).find(entry => (entry.content?.$t ?? '').includes(`data-week="${window.weekStart}"`));
        if (hit) {
            const url = hit.link?.find(link => link.rel === 'alternate')?.href ?? null;
            await record({ event: 'SKIPPED_EXISTING', postId: null, publicPostUrl: url, title: hit.title?.$t ?? '', detail: 'found on the public label feed' });
            await done({ state: 'SKIP', reason: 'this week is already on the blog', publicPostUrl: url, publishCallCount: 0 });
        }
    }
    else if (response.status !== 404)
        await done({ state: 'HOLD', reasons: ['PUBLIC_FEED_LOOKUP_' + response.status], publishCallCount: 0 });
}
catch (error) {
    await done({ state: 'HOLD', reasons: ['PUBLIC_FEED_LOOKUP_FAILED'], detail: error instanceof Error ? error.message : String(error), publishCallCount: 0 });
}
const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8'));
const config = { ...raw.blogger, blogId: process.env.BLOGGER_BLOG_ID.trim(), credentialAvailable: true, publishAsDraft: true };
const google = new GoogleBloggerApiAdapter();
let postId = null;
try {
    const same = await google.findMatchingPosts({ title: article.title, label: WEEKLY_LABEL }, config);
    const live = same.find(item => item.status === 'PUBLISHED' && item.url);
    if (live) {
        await record({ event: 'SKIPPED_EXISTING', postId: live.postId, publicPostUrl: live.url, title: live.title, detail: 'same title already published' });
        await done({ state: 'SKIP', reason: 'same title already published', postId: live.postId, publicPostUrl: live.url, publishCallCount: 0 });
    }
    // Reuse this week's own draft (an earlier run that failed between insert and publish) rather than adding a post.
    const draftId = prior.filter(item => item.event === 'DRAFT_CREATED').at(-1)?.postId ?? same.find(item => item.status === 'DRAFT')?.postId ?? null;
    if (draftId) {
        const existing = await google.readPost(draftId, config);
        if (existing.status === 'PUBLISHED' && existing.url) {
            await record({ event: 'SKIPPED_EXISTING', postId: draftId, publicPostUrl: existing.url, title: existing.title, detail: 'earlier draft was already published' });
            await done({ state: 'SKIP', postId: draftId, publicPostUrl: existing.url, publishCallCount: 0 });
        }
        if (existing.status === 'DRAFT') {
            await google.patchPostContent(draftId, { title: article.title, content: html, labels: [WEEKLY_LABEL] }, config);
            postId = draftId;
        }
    }
    if (!postId) {
        const draft = await google.insertDraftContent({ title: article.title, content: html, labels: [WEEKLY_LABEL] }, config);
        postId = draft.postId;
        await record({ event: 'DRAFT_CREATED', postId, publicPostUrl: null, title: article.title, detail: 'draft inserted' });
    }
    const result = await google.publishDraftPost(postId, config), after = await google.readPost(postId, config);
    if (after.status !== 'PUBLISHED' || !isPublicBloggerPostUrl(after.url) || after.url !== result.publicPostUrl || after.title !== article.title)
        throw new Error('readback after publish does not match (status, permalink or title)');
    if (!after.content.includes(`data-week="${window.weekStart}"`))
        throw new Error('stored content is missing the week marker');
    await record({ event: 'PUBLISHED', postId, publicPostUrl: after.url, title: article.title, detail: 'published and read back' });
    await done({ state: 'PUBLISHED', postId, publicPostUrl: after.url, title: article.title, publishCallCount: 1 });
}
catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await record({ event: 'FAILED', postId, publicPostUrl: null, title: article.title, detail });
    await done({ state: 'FAILED', postId, reason: detail });
}
