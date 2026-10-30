import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { approveBloggerPublication, GoogleBloggerApiAdapter, publishBloggerPublication } from './services/blogger.js';
import { createApprovedGoldenBloggerRecord, performGoldenHumanReview, verifyGoldenBloggerReadback } from './intelligence/golden-review.js';
if (!process.argv.includes('--human-approved'))
    throw new Error('explicit --human-approved flag required; automatic approval is prohibited');
const reviewedAt = new Date().toISOString();
const review = performGoldenHumanReview(reviewedAt, 'APPROVED');
if (review.decision !== 'APPROVED')
    throw new Error('Human Review MODIFY required; Blogger API not called');
const config = await publishingConfig();
const dir = 'data/golden-intelligence/2026-09-29';
const bloggerDir = 'data/blogger/2026-09-29';
await mkdir(bloggerDir, { recursive: true });
const publicationPath = `${bloggerDir}/newsletter-motus-2026-09-29-publication.json`;
let record;
let duplicateCount = 0;
try {
    record = JSON.parse(await readFile(publicationPath, 'utf8'));
    if (record.draftPostId)
        duplicateCount = 1;
}
catch {
    record = createApprovedGoldenBloggerRecord(config, review);
}
await writeFile(`${dir}/human-review-summary.json`, JSON.stringify(review, null, 2));
const adapter = new GoogleBloggerApiAdapter();
if (record.status === 'FAILED')
    record = approveBloggerPublication(record, { audience: 'admin', action: 'BLOGGER_APPROVE' }, reviewedAt);
if (!record.draftPostId) {
    record = await publishBloggerPublication(record, adapter, config, { audience: 'admin', action: 'BLOGGER_PUBLISH' });
    await writeFile(publicationPath, JSON.stringify(record, null, 2));
    if (record.history.at(-1)?.reason.includes('duplicate draft'))
        duplicateCount = 1;
}
if (record.status !== 'DRAFT' || !record.draftPostId)
    throw new Error(`Blogger draft creation failed: ${record.error ?? record.status}`);
const readback = await adapter.readPost(record.draftPostId, config);
const verification = verifyGoldenBloggerReadback(readback);
if (!verification.pass)
    throw new Error(`actual Blogger render verification failed: ${JSON.stringify(verification.checks)}`);
await Promise.all([writeFile(publicationPath, JSON.stringify(record, null, 2)), writeFile(`${bloggerDir}/newsletter-motus-2026-09-29-readback.html`, readback.content), writeFile(`${bloggerDir}/newsletter-motus-2026-09-29-verification.json`, JSON.stringify({ postId: readback.postId, state: readback.status, publicPostUrl: record.publicPostUrl, duplicateCount, verification }, null, 2))]);
console.log(JSON.stringify({ decision: review.decision, modified: true, draftPostId: record.draftPostId, state: record.status, publicPostUrl: record.publicPostUrl, duplicateCount, actualBloggerRender: verification.pass ? 'PASS' : 'FAIL', mobile: verification.checks.mobile ? 'PASS' : 'FAIL', sourceLinks: verification.checks.sourceLinks ? 'PASS' : 'FAIL' }, null, 2));
async function publishingConfig() { const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8')); const env = raw.blogger; const blogId = (env.blogIdEnvironmentVariable ? process.env[env.blogIdEnvironmentVariable] ?? env.blogId : env.blogId) ?? null; const refresh = env.refreshTokenEnvironmentVariable ? process.env[env.refreshTokenEnvironmentVariable] : undefined; const clientId = env.clientIdEnvironmentVariable ? process.env[env.clientIdEnvironmentVariable] : undefined; const secret = env.clientSecretEnvironmentVariable ? process.env[env.clientSecretEnvironmentVariable] : undefined; return { ...env, blogId, credentialAvailable: Boolean(blogId && refresh && clientId && secret), publishAsDraft: true }; }
