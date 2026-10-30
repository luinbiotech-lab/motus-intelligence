import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runPipeline } from './services/pipeline.js';
import { applyReviewActions, buildMachineHumanDiff, buildPublishReadyDraft, buildReviewSheet, createReviewAction } from './services/review.js';
import { renderBrokerageReportOnDemand, renderDailyEditorial } from './services/editorial.js';
import { renderA4MasterOnDemand } from './services/a4-visual.js';
import { approveBloggerPublication, createBloggerPreview, DryRunBloggerAdapter, GoogleBloggerApiAdapter, publishBloggerPublication, renderPublishingConsole } from './services/blogger.js';
import { updateExistingBloggerDraft } from './services/blogger-draft-update.js';
import { writeEditorialLayoutComparison, writeEditorialReviewArtifacts, writeFinancialResearchLayoutComparison } from './services/editorial-review.js';
async function main() {
    const args = process.argv.slice(2);
    const sample = args[0] === '--sample';
    if (args[0] === '--review')
        return await writeReviewSheet(args[1]);
    if (args[0] === '--apply-review-actions')
        return await applyReviewActionFile(args[1], args[2], args[3]);
    if (args[0] === '--editorial')
        return await writeEditorial(args[1], args[2]);
    if (args[0] === '--brokerage-report')
        return await writeBrokerageReport(args[1], args[2]);
    if (args[0] === '--a4-master')
        return await writeA4Master(args[1], args[2], args.includes('--regenerate'));
    if (args[0] === '--blogger-preview')
        return await writeBloggerPreview(args[1], args[2]);
    if (args[0] === '--blogger-approve')
        return await writeBloggerApprove(args[1]);
    if (args[0] === '--blogger-publish')
        return await writeBloggerPublish(args[1], args.includes('--dry-run'));
    if (args[0] === '--blogger-update-draft')
        return await writeBloggerDraftUpdate(args[1], args[2], args[3], args[4]);
    if (args[0] === '--publishing-console')
        return await writePublishingConsole(args[1]);
    if (args[0] === '--editorial-review-preview')
        return await writeEditorialReviewPreview(args[1], args[2], args[3], args[4]);
    if (args[0] === '--editorial-layout-preview')
        return await writeEditorialLayoutPreview(args[1], args[2], args[3], args[4], args[5]);
    if (args[0] === '--financial-research-layout-preview')
        return await writeFinancialResearchLayoutPreview(args[1], args[2], args[3], args[4], args[5]);
    if ((sample && args.length !== 1) || (!sample && (args.length !== 2 || args[0] !== '--input')))
        throw new Error('사용법: npm run sample 또는 npm run report -- --input data/manual/day.json');
    const path = sample ? 'data/fixtures/sample-day.json' : args[1];
    const read = async (p) => JSON.parse((await readFile(resolve(p), 'utf8')).replace(/^\uFEFF/, ''));
    const [raw, sources, rules] = await Promise.all([read(path), read('config/sources.json'), read('config/us-korea-rules.v1.json')]);
    const result = runPipeline(raw, sources, rules);
    await Promise.all([mkdir('data/reports', { recursive: true }), mkdir('data/evidence', { recursive: true })]);
    const prefix = result.report.reportId;
    await Promise.all([writeFile(`data/reports/${prefix}.md`, result.markdown), writeFile(`data/reports/${prefix}.json`, JSON.stringify(result.report, null, 2)), writeFile(`data/evidence/${prefix}.json`, JSON.stringify(result.evidence, null, 2))]);
    console.log(JSON.stringify({ status: result.operationalStatus, reportId: prefix, sample: result.report.sample, publishStatus: result.evidence.publishStatus, issues: result.evidence.validationResult.issues, stages: result.stages, files: [`data/reports/${prefix}.md`, `data/reports/${prefix}.json`, `data/evidence/${prefix}.json`] }, null, 2));
    process.exitCode = result.operationalStatus === 'BLOCKED' ? 3 : result.operationalStatus === 'FAILED' ? 2 : 0;
}
async function writeReviewSheet(evidencePath) {
    if (!evidencePath)
        throw new Error('사용법: node dist/src/cli.js --review data/evidence/report.json');
    const evidence = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
    const sheet = buildReviewSheet(evidence);
    const dir = `data/reviews/${evidence.reportMetadata.tradingDate}`;
    await mkdir(dir, { recursive: true });
    const jsonPath = `${dir}/${evidence.reportId}-review.json`;
    const mdPath = `${dir}/${evidence.reportId}-review.md`;
    await writeFile(jsonPath, JSON.stringify(sheet, null, 2));
    await writeFile(mdPath, reviewSheetMarkdown(sheet));
    console.log(JSON.stringify({ status: 'PASS', reportId: evidence.reportId, files: [mdPath, jsonPath], approvalStatus: sheet.approvalStatus, blocked: sheet.blocked, reviewItems: sheet.items.length }, null, 2));
}
async function applyReviewActionFile(evidencePath, reportPath, actionsPath) {
    if (!evidencePath || !reportPath || !actionsPath)
        throw new Error('사용법: node dist/src/cli.js --apply-review-actions data/evidence/report.json data/reports/report.json actions.json');
    const evidence = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
    const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
    const actionInputs = JSON.parse(await readFile(resolve(actionsPath), 'utf8'));
    const actions = actionInputs.map(input => createReviewAction(evidence, input));
    const reviewed = applyReviewActions(evidence, actions);
    const draft = buildPublishReadyDraft(report, reviewed, actions);
    const diff = buildMachineHumanDiff(report, draft, actions);
    const dir = `data/publish-ready/${report.tradingDate}`;
    await mkdir(dir, { recursive: true });
    const files = [`${dir}/${report.reportId}-reviewed-evidence.json`, `${dir}/${report.reportId}-report.md`, `${dir}/${report.reportId}-report.json`, `${dir}/${report.reportId}-diff.json`, `${dir}/${report.reportId}-actions.json`];
    await Promise.all([
        writeFile(files[0], JSON.stringify(reviewed, null, 2)),
        writeFile(files[1], draft.markdown),
        writeFile(files[2], JSON.stringify(draft, null, 2)),
        writeFile(files[3], JSON.stringify(diff, null, 2)),
        writeFile(files[4], JSON.stringify(actions, null, 2))
    ]);
    console.log(JSON.stringify({ status: 'PASS', reportId: report.reportId, approvalStatus: reviewed.approvalStatus, publishAllowed: draft.publishAllowed, files }, null, 2));
}
async function writeEditorial(reportPath, evidencePath) {
    if (!reportPath || !evidencePath)
        throw new Error('사용법: node dist/src/cli.js --editorial data/reports/report.json data/evidence/report.json');
    const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
    const evidence = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
    const editorial = renderDailyEditorial(report, evidence);
    const dir = `data/editorial/${report.tradingDate}`;
    await mkdir(dir, { recursive: true });
    const files = [`${dir}/${report.reportId}-blogger.md`, `${dir}/${report.reportId}-blogger.json`, `${dir}/${report.reportId}-naver.json`, `${dir}/${report.reportId}-opportunities.json`, `${dir}/${report.reportId}-terms.json`];
    await Promise.all([
        writeFile(files[0], editorial.bloggerMarkdown),
        writeFile(files[1], JSON.stringify({ seo: editorial.seo, body: editorial.bloggerMarkdown, terms: editorial.terms }, null, 2)),
        writeFile(files[2], JSON.stringify(editorial.naver, null, 2)),
        writeFile(files[3], JSON.stringify(editorial.opportunities, null, 2)),
        writeFile(files[4], JSON.stringify(editorial.terms, null, 2))
    ]);
    console.log(JSON.stringify({ status: 'PASS', tradingDate: report.tradingDate, files, opportunities: editorial.opportunities.map(item => ({ contentType: item.contentType, recommended: item.recommended })), naver: editorial.naver }, null, 2));
}
async function writeBrokerageReport(reportPath, evidencePath) {
    if (!reportPath || !evidencePath)
        throw new Error('사용법: node dist/src/cli.js --brokerage-report data/reports/report.json data/evidence/report.json');
    const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
    const evidence = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
    const output = await renderBrokerageReportOnDemand(report, evidence, `data/brokerage/${report.tradingDate}`);
    console.log(JSON.stringify({ status: 'PASS', reportId: output.reportId, cached: output.cached, file: `data/brokerage/${report.tradingDate}/${report.reportId}-${output.rendererVersion}.md`, naver: output.naver }, null, 2));
}
async function writeA4Master(reportPath, evidencePath, regenerate) {
    if (!reportPath || !evidencePath)
        throw new Error('사용법: node dist/src/cli.js --a4-master data/reports/report.json data/evidence/report.json [--regenerate]');
    const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
    const evidence = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
    const publication = await tryReadPublication(report);
    const output = await renderA4MasterOnDemand(report, evidence, `data/a4-master/${report.tradingDate}`, { audience: 'admin', action: 'A4_REPORT_RENDER' }, { regenerate, bloggerRecord: publication, publishingConfig: await readPublishingConfig() });
    console.log(JSON.stringify({ status: 'PASS', reportId: output.reportId, cached: output.cached, html: output.htmlPath, pdf: output.pdfPath, png: output.pngPath, naverPackage: output.naverPackagePath, admin: output.adminPath, onePage: output.layout.onePage, qrTargetUrl: output.layout.qrTargetUrl }, null, 2));
}
async function writeBloggerPreview(reportPath, evidencePath) {
    if (!reportPath || !evidencePath)
        throw new Error('사용법: node dist/src/cli.js --blogger-preview data/reports/report.json data/evidence/report.json');
    const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
    const evidence = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
    const record = createBloggerPreview(report, evidence, await readPublishingConfig());
    const paths = await writePublicationArtifacts(record);
    console.log(JSON.stringify({ status: 'PASS', reportId: record.reportId, publicationStatus: record.status, previewUrl: record.previewUrl, files: paths }, null, 2));
}
async function writeBloggerApprove(publicationPath) {
    if (!publicationPath)
        throw new Error('사용법: node dist/src/cli.js --blogger-approve data/blogger/date/report-publication.json');
    const record = JSON.parse(await readFile(resolve(publicationPath), 'utf8'));
    const approved = approveBloggerPublication(record, { audience: 'admin', action: 'BLOGGER_APPROVE' });
    const paths = await writePublicationArtifacts(approved);
    console.log(JSON.stringify({ status: 'PASS', reportId: approved.reportId, publicationStatus: approved.status, files: paths }, null, 2));
}
async function writeBloggerPublish(publicationPath, dryRun) {
    if (!publicationPath)
        throw new Error('사용법: node dist/src/cli.js --blogger-publish data/blogger/date/report-publication.json [--dry-run]');
    const record = JSON.parse(await readFile(resolve(publicationPath), 'utf8'));
    const adapter = dryRun ? new DryRunBloggerAdapter() : new GoogleBloggerApiAdapter();
    const published = await publishBloggerPublication(record, adapter, await readPublishingConfig(), { audience: 'admin', action: 'BLOGGER_PUBLISH' }, { dryRun });
    const paths = await writePublicationArtifacts(published);
    console.log(JSON.stringify({ status: published.status === 'FAILED' ? 'FAILED' : 'PASS', reportId: published.reportId, publicationStatus: published.status, draftPostId: published.draftPostId, publicPostUrl: published.publicPostUrl, dryRun: published.dryRun, error: published.error, files: paths }, null, 2));
}
async function writeBloggerDraftUpdate(publicationPath, previewPath, metadataPath, expectedPostId) {
    if (!publicationPath || !previewPath || !metadataPath || !expectedPostId)
        throw new Error('사용법: node dist/src/cli.js --blogger-update-draft publication.json preview.html preview.json expectedPostId');
    const record = JSON.parse(await readFile(resolve(publicationPath), 'utf8'));
    const previewHtml = await readFile(resolve(previewPath), 'utf8');
    const metadata = JSON.parse(await readFile(resolve(metadataPath), 'utf8'));
    if (!metadata.title)
        throw new Error('preview metadata is missing title');
    if (metadata.reviewStatus !== undefined) {
        if (metadata.reviewStatus !== 'APPROVED' || metadata.approval?.decision !== 'APPROVE' || metadata.approval.reviewer !== 'human' || !metadata.approval.reviewedAt)
            throw new Error('editorial review requires recorded human approval');
    }
    const expectedLayout = previewHtml.includes('data-layout="blogger-inline-v1"') || previewHtml.includes('data-layout="financial-research-v1"') ? 'FINANCIAL_RESEARCH_V1' : previewHtml.includes('data-section="glossary"') && previewHtml.includes('block-korea-market') ? 'CATEGORY_BLOCK_V1' : undefined;
    const result = await updateExistingBloggerDraft(record, previewHtml, await readPublishingConfig(), { audience: 'admin', action: 'BLOGGER_PUBLISH' }, { expectedPostId, expectedTitle: metadata.title, ...(metadata.version?.includes('AI-REVIEW') ? { expectedEditorialFocus: 'AI_SEMICONDUCTOR' } : {}), ...(expectedLayout ? { expectedLayout } : {}) });
    const files = await writePublicationArtifacts(result.record);
    const verificationPath = `data/blogger/${record.tradingDate}/${record.reportId}-draft-update-verification.json`;
    await writeFile(verificationPath, JSON.stringify(result.verification, null, 2));
    console.log(JSON.stringify({ status: 'PASS', publicationStatus: result.record.status, draftPostId: result.record.draftPostId, publicPostUrl: result.record.publicPostUrl, verification: result.verification, files: [...files, verificationPath] }, null, 2));
}
async function writePublishingConsole(publicationPath) {
    const record = publicationPath ? JSON.parse(await readFile(resolve(publicationPath), 'utf8')) : null;
    const html = renderPublishingConsole(record, { audience: 'admin', action: 'BLOGGER_PREVIEW' });
    const dir = record ? `data/blogger/${record.tradingDate}` : 'data/blogger/console';
    await mkdir(dir, { recursive: true });
    const path = record ? `${dir}/${record.reportId}-publishing-console.html` : `${dir}/publishing-console.html`;
    await writeFile(path, html);
    console.log(JSON.stringify({ status: 'PASS', file: path, publicationStatus: record?.status ?? 'DRAFT' }, null, 2));
}
async function writePublicationArtifacts(record) {
    const dir = `data/blogger/${record.tradingDate}`;
    await mkdir(dir, { recursive: true });
    const jsonPath = `${dir}/${record.reportId}-publication.json`;
    const htmlPath = `${dir}/${record.reportId}-preview.html`;
    const consolePath = `${dir}/${record.reportId}-publishing-console.html`;
    await Promise.all([
        writeFile(jsonPath, JSON.stringify(record, null, 2)),
        writeFile(htmlPath, record.html),
        writeFile(consolePath, renderPublishingConsole(record, { audience: 'admin', action: 'BLOGGER_PREVIEW' }))
    ]);
    return [jsonPath, htmlPath, consolePath];
}
async function readPublishingConfig() {
    const raw = JSON.parse(await readFile(resolve('config/publishing.json'), 'utf8'));
    const credentialEnv = raw.blogger.credentialEnvironmentVariable;
    const blogIdEnv = raw.blogger.blogIdEnvironmentVariable;
    const blogId = (blogIdEnv ? process.env[blogIdEnv] ?? raw.blogger.blogId : raw.blogger.blogId) ?? null;
    const refresh = raw.blogger.refreshTokenEnvironmentVariable ? process.env[raw.blogger.refreshTokenEnvironmentVariable] : undefined;
    const clientId = raw.blogger.clientIdEnvironmentVariable ? process.env[raw.blogger.clientIdEnvironmentVariable] : undefined;
    const clientSecret = raw.blogger.clientSecretEnvironmentVariable ? process.env[raw.blogger.clientSecretEnvironmentVariable] : undefined;
    const refreshCredentialAvailable = Boolean(refresh && clientId && clientSecret);
    const fallbackCredentialAvailable = credentialEnv ? Boolean(process.env[credentialEnv]) : raw.blogger.credentialAvailable === true;
    return { ...raw.blogger, blogId, credentialAvailable: Boolean(blogId) && (refreshCredentialAvailable || fallbackCredentialAvailable) };
}
async function writeEditorialReviewPreview(reportPath, evidencePath, publicationPath, planPath) {
    if (!reportPath || !evidencePath || !publicationPath || !planPath)
        throw new Error('사용법: node dist/src/cli.js --editorial-review-preview report.json evidence.json publication.json review-plan.json');
    const [report, evidence, publication, plan] = await Promise.all([
        readFile(resolve(reportPath), 'utf8').then(value => JSON.parse(value)),
        readFile(resolve(evidencePath), 'utf8').then(value => JSON.parse(value)),
        readFile(resolve(publicationPath), 'utf8').then(value => JSON.parse(value)),
        readFile(resolve(planPath), 'utf8').then(value => JSON.parse(value))
    ]);
    const config = await readPublishingConfig();
    const files = await writeEditorialReviewArtifacts(report, evidence, publication, plan, config.publisher, `data/editorial/${report.tradingDate}`);
    console.log(JSON.stringify({ status: 'PASS', reviewStatus: plan.reviewStatus, publicationStatus: publication.status, draftPostId: publication.draftPostId, publicPostUrl: publication.publicPostUrl, bloggerWriteAttempted: false, files }, null, 2));
}
async function writeEditorialLayoutPreview(reportPath, evidencePath, publicationPath, planPath, beforePath) {
    if (!reportPath || !evidencePath || !publicationPath || !planPath || !beforePath)
        throw new Error('사용법: node dist/src/cli.js --editorial-layout-preview report.json evidence.json publication.json review-plan.json before.html');
    const [report, evidence, publication, plan] = await Promise.all([
        readFile(resolve(reportPath), 'utf8').then(value => JSON.parse(value)),
        readFile(resolve(evidencePath), 'utf8').then(value => JSON.parse(value)),
        readFile(resolve(publicationPath), 'utf8').then(value => JSON.parse(value)),
        readFile(resolve(planPath), 'utf8').then(value => JSON.parse(value))
    ]);
    const config = await readPublishingConfig();
    const output = await writeEditorialLayoutComparison(report, evidence, publication, plan, config.publisher, resolve(beforePath), `data/editorial/${report.tradingDate}`);
    console.log(JSON.stringify({ status: 'PASS', publicationStatus: publication.status, draftPostId: publication.draftPostId, bloggerApiCalled: false, files: output.files, comparison: output.comparison }, null, 2));
}
async function writeFinancialResearchLayoutPreview(reportPath, evidencePath, publicationPath, planPath, beforePath) {
    if (!reportPath || !evidencePath || !publicationPath || !planPath || !beforePath)
        throw new Error('사용법: node dist/src/cli.js --financial-research-layout-preview report.json evidence.json publication.json review-plan.json before.html');
    const [report, evidence, publication, plan] = await Promise.all([
        readFile(resolve(reportPath), 'utf8').then(value => JSON.parse(value)), readFile(resolve(evidencePath), 'utf8').then(value => JSON.parse(value)),
        readFile(resolve(publicationPath), 'utf8').then(value => JSON.parse(value)), readFile(resolve(planPath), 'utf8').then(value => JSON.parse(value))
    ]);
    const config = await readPublishingConfig();
    const output = await writeFinancialResearchLayoutComparison(report, evidence, publication, plan, config.publisher, resolve(beforePath), `data/editorial/${report.tradingDate}`);
    console.log(JSON.stringify({ status: 'PASS', publicationStatus: publication.status, draftPostId: publication.draftPostId, bloggerApiCalled: false, files: output.files, comparison: output.comparison }, null, 2));
}
async function tryReadPublication(report) {
    const path = `data/blogger/${report.tradingDate}/${report.reportId}-publication.json`;
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    }
    catch {
        return null;
    }
}
function reviewSheetMarkdown(sheet) {
    return `# Review Sheet — ${sheet.reportId}

- tradingDate: ${sheet.tradingDate}
- generatedAt: ${sheet.generatedAt}
- approvalStatus: ${sheet.approvalStatus}
- blocked: ${sheet.blocked}
- VERIFIED: ${sheet.counts.VERIFIED}
- PARTIALLY_VERIFIED: ${sheet.counts.PARTIALLY_VERIFIED}
- CONFLICT: ${sheet.counts.CONFLICT}
- UNVERIFIED: ${sheet.counts.UNVERIFIED}
- REVIEW_REQUIRED: ${sheet.counts.REVIEW_REQUIRED_QUEUE}

## Priority Items

${sheet.items.filter(item => item.verificationStatus !== 'VERIFIED' || item.priority >= 50).map(item => `### ${item.claimId}

- status: ${item.verificationStatus}
- confidenceScore: ${item.confidenceScore}
- claimType: ${item.claimType}
- informationType: ${item.informationType}
- sourceTier: ${item.sourceTier}
- evidenceIds: ${item.evidenceIds.join(', ') || 'n/a'}
- recommendedAction: ${item.recommendedAction}
- reason: ${item.reason}

${item.claimText}
`).join('\n') || '- 우선 검수 항목 없음'}

## VERIFIED Summary

- count: ${sheet.verifiedSummary.count}
- sampleClaimIds: ${sheet.verifiedSummary.sampleClaimIds.join(', ') || 'n/a'}
`;
}
main().catch(error => { console.error(JSON.stringify({ status: 'BLOCKED', message: String(error) })); process.exitCode = 3; });
