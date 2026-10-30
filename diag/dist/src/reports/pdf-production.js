import { createHash } from 'node:crypto';
import { createFirstSplitDailyProductionRun } from '../intelligence/split-daily-production.js';
import { createPeriodicProductionRun } from '../intelligence/periodic-production.js';
import { createLiveEditorialCycle } from '../editorial/live-cycle.js';
export const PDF_FONT_FALLBACKS = ['Malgun Gothic', 'Noto Sans CJK KR', 'Arial Unicode MS'];
export const PDF_MIN_BODY_FONT_PT = 8;
export const REPORT_DESIGN_TOKENS = { MOTUS_NAVY: '#03162e', OFF_WHITE: '#f7f9fc', SLATE: '#59697d', POSITIVE_RED: '#c62828', NEGATIVE_BLUE: '#1565c0', NEUTRAL_GRAY: '#c4cfdb', spacing: [4, 8, 12, 16, 24], heading: [11, 16, 20], bodyMinimumPt: PDF_MIN_BODY_FONT_PT, captionMinimumPt: 6, chartLabelMinimumPt: 5.5, footerPt: 6.5 };
export class LocalOnlyReportStorageAdapter {
    provider = 'LOCAL_ONLY';
    state = 'READY';
    async uploadArtifact(_artifact) { throw new Error('LOCAL_ONLY_UPLOAD_DISABLED'); }
    async getArtifact(_objectId) { return null; }
    async validatePublicUrl(_url) { return false; }
    async revokePublicUrl(_objectId) { }
}
export class GoogleDriveReportStorageBoundary {
    provider = 'GOOGLE_DRIVE';
    state = 'NOT_CONFIGURED';
    folderPlan = ['MOTUS Reports', '{year}', 'Daily/{AI|US Market|Korea Market}', 'Weekly', 'Monthly'];
    async uploadArtifact(_artifact) { throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED'); }
    async getArtifact(_objectId) { return null; }
    async validatePublicUrl(_url) { return false; }
    async revokePublicUrl(_objectId) { throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED'); }
}
export function buildDailyPdfViewModels() {
    return createFirstSplitDailyProductionRun().units.map(unit => {
        if (unit.category === 'AI_INTELLIGENCE')
            return aiDocument(unit.viewModel);
        if (unit.category === 'US_MARKET')
            return usDocument(unit.viewModel);
        return koreaDocument(unit.viewModel);
    });
}
export function buildLiveDailyPdfViewModels(generatedAt = '2026-10-06T20:00:00+09:00') { return createLiveEditorialCycle(generatedAt).units.filter(unit => unit.category !== 'KOREA_MARKET').map(unit => unit.category === 'AI_INTELLIGENCE' ? aiDocument(unit.viewModel) : usDocument(unit.viewModel)); }
export function buildPeriodicPdfFoundations() { const run = createPeriodicProductionRun(); return { weekly: weeklyDocument(run.weekly), monthly: periodicDocument(run.monthlyPdf) }; }
function aiDocument(view) { return documentBase(view.publicationId, 'AI_DAILY', view.issueDate, 'AI 인텔리전스 (AI Intelligence)', view.subtitle, [{ title: '오늘의 핵심', items: [view.todayCore.headline, view.todayCore.summary, ...view.todayCore.bullets] }, { title: '주요 AI 이슈', items: view.issues.map(item => `${item.headline}. ${sentences([...item.whatHappened, item.coreContent, item.whyItMatters, item.marketConnection])}`) }, { title: '산업·기업 연결', items: view.industryConnections.filter(item => item.explanation && item.evidenceRefs.length).map(item => `${item.title}. ${item.explanation}${item.optionalWatchPoint ? ` ${item.optionalWatchPoint}` : ''}`) }, { title: '다음 확인사항', items: view.whatToWatch.map(item => `${item.headline}: ${item.watchFor}`) }], view.sources, [], false); }
function sentences(values) { return values.filter((value) => Boolean(value?.trim())).map(value => /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`).join(' '); }
function usDocument(view) { const charts = view.marketHistory.series.map(series => ({ title: series.label, period: `${series.dates[0]} - ${series.dates.at(-1)}`, labels: series.dates, values: series.closes, latestValue: series.latestClose.toLocaleString('en-US'), change: `${series.latestChangePct > 0 ? '+' : ''}${series.latestChangePct.toFixed(2)}%`, direction: series.latestChangePct > 0 ? 'UP' : series.latestChangePct < 0 ? 'DOWN' : 'UNCHANGED', sourceLabel: series.sourceLabel })); return documentBase(view.publicationId, 'US_MARKET_DAILY', view.issueDate, '미국증시 (U.S. Market)', view.subtitle, [{ title: '시장 요약', items: [view.marketSummary] }, { title: 'VIX·금리·환율·유가', items: view.supportingMetrics.map(item => `${item.label}: ${item.value}${item.change ? ` (${item.change})` : ''}`) }, { title: '시장을 움직인 요인', items: view.marketCommentary }, { title: '주요 업종·종목', items: view.sectorsCompanies }, { title: 'Wall Street Research', items: view.wallStreetResearch.flatMap(item => [`${item.headline}: ${item.institutionView}`, `MOTUS 해석: ${item.motusInterpretation}`]) }, { title: '다음 세션 체크', items: view.checkpoints.map(item => `${item.headline}: ${item.watchFor}`) }], view.sources, charts, false); }
function koreaDocument(view) { const values = (title, items) => ({ title, items: items.map(item => `${item.label}: ${item.displayValue}`) }); return documentBase(view.publicationId, 'KOREA_MARKET_DAILY', view.issueDate, '국내증시 (Korea Market)', view.subtitle, [{ title: '시장 요약', items: [view.marketSummary] }, values('KOSPI·KOSDAQ·환율', [...view.indexMetrics, ...view.fxAndSupporting]), values('투자자 수급', view.investorFlows), values('업종·주요 종목', [...view.sectors, ...view.movers]), { title: '국내 증권사 리서치', items: view.research.flatMap(item => [`${item.publisher}: ${item.institutionView}`, ...(item.aiInterpretation ? [`MOTUS 해석: ${item.aiInterpretation}`] : [])]) }, { title: '다음 세션 체크', items: view.checkpoints.map(item => `${item.headline}: ${item.watchFor}`) }], view.sources, [], false); }
function weeklyDocument(view) { const map = view.investmentMap; const investment = map ? [...map.institutionalFocus, ...map.crossMarketThemes, ...map.discussedCompanies, ...map.riskMentions] : []; return documentBase(view.metadata.publicationId, 'WEEKLY_INTELLIGENCE', view.metadata.periodEnd, '주간 인텔리전스 (Weekly Intelligence)', view.metadata.readinessReasons.join(' · '), [{ title: 'Executive Summary', items: [view.executiveSummary] }, { title: 'Week at a Glance', items: view.weekAtAGlance }, { title: 'AI & Industry', items: view.aiIntelligence }, { title: 'U.S. Market', items: view.usMarket }, { title: 'Korea Market', items: view.koreaMarket }, { title: 'Cross Intelligence', items: view.crossIntelligence ?? [] }, { title: 'Investment Map', items: investment }, { title: 'Risks', items: view.riskSignals ?? [] }, { title: 'Next Week Watch', items: view.nextWeekWatch }], view.sources, [], true, view.metadata.periodStart, view.metadata.periodEnd); }
function periodicDocument(view) { return documentBase(view.metadata.publicationId, 'MONTHLY_INTELLIGENCE', view.metadata.periodEnd, '월간 인텔리전스 (Monthly Intelligence)', view.metadata.readinessReasons.join(' · ') || '검증된 기간 데이터 요약', view.sections, view.sources, [], true, view.metadata.periodStart, view.metadata.periodEnd); }
function documentBase(publicationId, reportType, issueDate, displayTitle, subtitle, sections, sources, charts, previewOnly, periodStart = issueDate, periodEnd = issueDate) { const normalizedSources = dedupeSources(sources); const sourceFingerprint = hash(normalizedSources); const core = { publicationId, reportType, issueDate, periodStart, periodEnd, displayTitle, subtitle, sections: sections.filter(section => section.items.length), sources: normalizedSources, charts, reviewState: 'PENDING', sourceFingerprint, publicUrl: null, previewOnly, colorMaster: { primary: '#03162e', positive: '#c62828', negative: '#1565c0', neutral: '#59697d' }, commerce: { enabled: false } }; return { ...core, contentFingerprint: hash(core) }; }
export function canonicalReportFileName(reportType, issueDate, periodStart) { const names = { AI_DAILY: `motus-ai-daily-${issueDate}.pdf`, US_MARKET_DAILY: `motus-us-market-${issueDate}.pdf`, KOREA_MARKET_DAILY: `motus-korea-market-${issueDate}.pdf`, WEEKLY_INTELLIGENCE: `motus-weekly-${isoWeek(periodStart ?? issueDate)}.pdf`, MONTHLY_INTELLIGENCE: `motus-monthly-${issueDate.slice(0, 7)}.pdf` }; return names[reportType]; }
export function createGeneratedArtifact(view, localPath, fileSizeBytes, pageCount, generatedAt) { return { artifactId: `pdf:${view.publicationId}:${view.contentFingerprint.slice(0, 12)}`, publicationId: view.publicationId, reportType: view.reportType, issueDate: view.issueDate, periodStart: view.periodStart, periodEnd: view.periodEnd, fileName: canonicalReportFileName(view.reportType, view.issueDate, view.periodStart), localPath, fileSizeBytes, pageCount, contentFingerprint: view.contentFingerprint, sourceFingerprint: view.sourceFingerprint, generatedAt, state: 'GENERATED', downloadUrl: null, storageProvider: 'LOCAL_ONLY', storageObjectId: null, reviewState: view.reviewState, validationStatus: 'NOT_RUN', failureReason: null }; }
export function applyPdfValidation(artifact, validation) { return validation.status === 'PASS' ? { ...artifact, state: 'VALIDATED', validationStatus: 'PASS', failureReason: null } : { ...artifact, state: 'FAILED', validationStatus: 'FAIL', failureReason: validation.errors.join('; ') || 'PDF validation failed' }; }
export function approvePdfArtifact(artifact, reviewer, reviewedAt) { if (artifact.state !== 'VALIDATED')
    throw new Error('PDF validation required before approval'); if (!reviewer.trim() || !Number.isFinite(Date.parse(reviewedAt)))
    throw new Error('valid human review required'); return { ...artifact, state: 'UPLOAD_READY', reviewState: 'APPROVED' }; }
export async function uploadApprovedArtifact(artifact, storage) { if (artifact.state !== 'UPLOAD_READY' || artifact.reviewState !== 'APPROVED')
    throw new Error('UPLOAD_BLOCKED_HUMAN_APPROVAL_REQUIRED'); if (storage.state !== 'READY' || storage.provider === 'LOCAL_ONLY')
    throw new Error('STORAGE_NOT_CONFIGURED'); const result = await storage.uploadArtifact(artifact); return { ...artifact, state: 'UPLOADED', storageProvider: result.provider, storageObjectId: result.objectId, downloadUrl: null }; }
export async function markArtifactPublic(artifact, storage, url) { if (artifact.state !== 'UPLOADED' || !validHttpsPdf(url) || !await storage.validatePublicUrl(url))
    throw new Error('PUBLIC_URL_VALIDATION_FAILED'); return { ...artifact, state: 'PUBLIC_AVAILABLE', downloadUrl: url }; }
export function pdfDownloadCta(input) { return input.publicationState === 'PUBLISHED' && input.artifact.state === 'PUBLIC_AVAILABLE' && validHttpsPdf(input.artifact.downloadUrl) ? input.artifact.downloadUrl : null; }
export function optionalQrTarget(url) { return validPublicUrl(url) ? url : null; }
export function compareArticlePdfConsistency(input) { return input.articleSourceFingerprint === input.pdfSourceFingerprint && input.articleContentFingerprint === input.pdfContentFingerprint ? { state: 'PASS', reason: null } : { state: 'HOLD', reason: 'CONTENT_MISMATCH' }; }
export function archiveEntryFromArtifact(artifact, title, articleUrl) { return { title, issueDate: artifact.issueDate, periodStart: artifact.periodStart, periodEnd: artifact.periodEnd, category: artifact.reportType === 'AI_DAILY' ? 'AI_INTELLIGENCE' : artifact.reportType === 'US_MARKET_DAILY' ? 'US_MARKET' : artifact.reportType === 'KOREA_MARKET_DAILY' ? 'KOREA_MARKET' : artifact.reportType === 'WEEKLY_INTELLIGENCE' ? 'WEEKLY_INTELLIGENCE' : 'MONTHLY_INTELLIGENCE', reportType: artifact.reportType, downloadUrl: artifact.state === 'PUBLIC_AVAILABLE' ? artifact.downloadUrl : null, articleUrl: artifact.state === 'PUBLIC_AVAILABLE' && validPublicUrl(articleUrl) ? articleUrl : null, generatedAt: artifact.generatedAt, publishedAt: artifact.state === 'PUBLIC_AVAILABLE' ? artifact.generatedAt : null, state: artifact.state === 'PUBLIC_AVAILABLE' ? 'AVAILABLE' : 'PREVIEW_READY' }; }
export function reportLinkEdge(artifact, fromPublicationId) { return artifact.state === 'PUBLIC_AVAILABLE' && validHttpsPdf(artifact.downloadUrl) ? { fromPublicationId, toPublicationId: artifact.artifactId, reason: 'REPORT_LINK' } : null; }
export function validatePdfHeader(bytes) { return bytes.length > 8 && new TextDecoder('ascii').decode(bytes.slice(0, 8)).startsWith('%PDF-'); }
export function assertPdfPublicModelSafe(view) { const visible = JSON.stringify({ title: view.displayTitle, subtitle: view.subtitle, sections: view.sections, sources: view.sources }); if (/\b(?:claimId|evidenceId|reportId|confidenceScore|sourceTier|MANUAL_VERIFIED|candidate_id)\b/i.test(visible))
    throw new Error('PDF public content contains internal ID'); if (/placeholder|example\.com|localhost|127\.0\.0\.1|\bfixture\b/i.test(visible))
    throw new Error('PDF public content contains non-production value'); }
function dedupeSources(sources) { const map = new Map(); for (const source of sources) {
    const key = source.url.replace(/\/$/, '');
    if (!map.has(key))
        map.set(key, source);
} return [...map.values()]; }
function validHttpsPdf(url) { try {
    const parsed = new URL(url ?? '');
    return parsed.protocol === 'https:' && parsed.pathname.toLowerCase().endsWith('.pdf') && !['localhost', '127.0.0.1'].includes(parsed.hostname);
}
catch {
    return false;
} }
function validPublicUrl(url) { try {
    const parsed = new URL(url ?? '');
    return parsed.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname);
}
catch {
    return false;
} }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function isoWeek(date) { const current = new Date(`${date}T00:00:00Z`); const day = current.getUTCDay() || 7; current.setUTCDate(current.getUTCDate() + 4 - day); const year = current.getUTCFullYear(); const start = new Date(Date.UTC(year, 0, 1)); const week = Math.ceil((((current.getTime() - start.getTime()) / 86_400_000) + 1) / 7); return `${year}-w${String(week).padStart(2, '0')}`; }
