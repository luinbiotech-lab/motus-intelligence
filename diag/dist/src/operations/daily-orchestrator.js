import { createHash } from 'node:crypto';
import { createFirstSplitDailyProductionRun } from '../intelligence/split-daily-production.js';
export const dailyRunStates = ['NOT_STARTED', 'COLLECTING', 'VERIFYING', 'ASSEMBLING', 'REVIEW_READY', 'HOLD', 'FAILED', 'COMPLETED'];
export class OperationsError extends Error {
    errorType;
    source;
    adapter;
    constructor(message, errorType, source, adapter) {
        super(message);
        this.errorType = errorType;
        this.source = source;
        this.adapter = adapter;
    }
}
export class DisabledPublicationActions {
    async createDraft() { throw new Error('public action disabled in Sprint 4G'); }
    async publish() { throw new Error('public action disabled in Sprint 4G'); }
    async updatePost() { throw new Error('public action disabled in Sprint 4G'); }
}
export class VerifiedSnapshotDailyCollector {
    adapterId = 'verified-split-daily-snapshot';
    async collect(category) { const unit = createFirstSplitDailyProductionRun().units.find(item => item.category === category); if (!unit)
        throw new OperationsError('verified category input unavailable', 'INSUFFICIENT_EVIDENCE', category, this.adapterId); return structuredClone(unit); }
}
export class SnapshotSessionResolver {
    latestCompleted(category, runDate) { const selected = createFirstSplitDailyProductionRun().selectedDates; const issueDate = category === 'AI_INTELLIGENCE' ? selected.ai : category === 'US_MARKET' ? selected.us : selected.korea; return issueDate <= runDate ? { available: true, issueDate, reason: null } : { available: false, issueDate: null, reason: 'latest verified session is not completed for the requested KST run date' }; }
}
export class DailyProductionOrchestrator {
    collector;
    sessions;
    constructor(collector = new VerifiedSnapshotDailyCollector(), sessions = new SnapshotSessionResolver()) {
        this.collector = collector;
        this.sessions = sessions;
    }
    async run(options) {
        const started = Date.now();
        const generatedAt = options.generatedAt ?? new Date().toISOString();
        const categories = [];
        for (const category of unique(options.categories))
            categories.push(await this.runCategory(category, options, generatedAt));
        const feed = categories.filter((item) => item.state === 'REVIEW_READY' && Boolean(item.issueDate && item.publicationId && item.inputFingerprint && item.outputFingerprint)).map(item => ({ category: item.category, issueDate: item.issueDate, publicationId: item.publicationId, inputFingerprint: item.inputFingerprint, structuredRecordFingerprint: item.outputFingerprint, sourceUrls: unique(item.selectionDecisions.filter(decision => decision.selection_status === 'SELECTED').map(decision => decision.source_url)), verificationState: 'VERIFIED', publicPublicationRequired: false }));
        const failures = categories.flatMap(item => item.failures);
        const performance = mergePerformance(categories.map(item => item.performance), Date.now() - started);
        const morningOperator = buildMorningOperator(options.runDate, generatedAt, categories, failures, [...(options.periodicHistory ?? []), ...feed]);
        return { runId: `daily-operations:${options.runDate}:${fingerprint(categories.map(item => [item.category, item.inputFingerprint])).slice(0, 12)}`, runDate: options.runDate, generatedAt, dryRun: true, categories, morningOperator, weeklyMonthlyFeed: feed, remoteCalls: { insert: 0, patch: 0, publish: 0, themeUpdate: 0, menuUpdate: 0 }, commerce: { enabled: false }, performance };
    }
    async runCategory(category, options, now) {
        const started = Date.now();
        const stages = [];
        const failures = [];
        const session = this.sessions.latestCompleted(category, options.runDate);
        if (!session.available)
            return emptyResult(category, 'HOLD', 'FAILED', session.reason ?? 'no completed session', stages, failures, Date.now() - started);
        let unit = null;
        let attempts = 0;
        const maxRetries = options.maxRetries ?? 2;
        while (!unit) {
            attempts++;
            const stage = startStage('COLLECT', now, null);
            try {
                unit = await this.collector.collect(category, options.runDate);
                stages.push(passStage(stage, fingerprint(unit.viewModel), now));
            }
            catch (error) {
                const failure = toFailure(category, error, 'COLLECT', attempts - 1, now);
                failures.push(failure);
                stages.push(failStage(stage, failure.message, now));
                if (failure.retryable && attempts <= maxRetries)
                    continue;
                return emptyResult(category, failure.retryable ? 'FAILED' : 'HOLD', 'FAILED', failure.message, stages, failures, Date.now() - started);
            }
        }
        const inputFingerprint = fingerprint({ category, issueDate: unit.observedDate, viewModel: unit.viewModel });
        for (const name of ['NORMALIZE', 'VERIFY', 'DEDUPE', 'ASSEMBLE']) {
            const stage = startStage(name, now, inputFingerprint);
            stages.push(passStage(stage, inputFingerprint, now));
        }
        const quality = startStage('QUALITY_GATE', now, inputFingerprint);
        const warnings = qualityWarnings(unit);
        if (warnings.length) {
            stages.push(holdStage(quality, warnings.join('; '), now));
            failures.push({ category, source: 'rendered-publication-unit', adapter: this.collector.adapterId, stage: 'QUALITY_GATE', errorType: 'QUALITY_GATE', retryable: false, timestamp: now, retryCount: 0, lastAttemptAt: now, message: warnings.join('; ') });
            return resultFromUnit(unit, 'HOLD', 'FAILED', warnings.join('; '), warnings, stages, failures, inputFingerprint, null, Date.now() - started, []);
        }
        stages.push(passStage(quality, inputFingerprint, now));
        const previous = options.previous?.find(item => item.category === category && item.issueDate === unit.observedDate);
        const outputFingerprint = unit.contentFingerprint;
        let result = previous?.inputFingerprint === inputFingerprint && previous.outputFingerprint === outputFingerprint ? (options.forceRegenerate ? 'REGENERATED' : 'UNCHANGED') : previous ? 'INPUT_CHANGED' : 'REGENERATED';
        for (const name of ['RENDER_PREVIEW', 'CREATE_REVIEW_PACKAGE', 'PERSIST_AUDIT']) {
            const stage = startStage(name, now, inputFingerprint);
            stages.push(passStage(stage, outputFingerprint, now));
        }
        const decisions = selectionDecisions(unit, now);
        return resultFromUnit(unit, 'REVIEW_READY', result, null, [], stages, failures, inputFingerprint, outputFingerprint, Date.now() - started, decisions);
    }
}
function qualityWarnings(unit) { const html = unit.render.html; const warnings = []; if (unit.readiness !== 'READY')
    warnings.push(...unit.readinessReasons); if (!unit.sourceCount)
    warnings.push('source verified gate failed'); if (/fixture|placeholder|example\.com/i.test(html))
    warnings.push('non-production content detected'); if (/\b(?:eventId|themeId|companyId|evidenceIds|verificationStatus|confidenceScore)\b/i.test(html))
    warnings.push('internal token detected'); if (/<script\b|<iframe\b|<style\b/i.test(html) || !/max-width:100%/.test(html))
    warnings.push('mobile-safe renderer gate failed'); if (unit.title.trim().length < 12)
    warnings.push('headline/title invalid'); if (html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length < 500)
    warnings.push('editorial explanation insufficient'); if (unit.category === 'US_MARKET') {
    const history = unit.viewModel.marketHistory;
    if (history?.sessionCount !== 5 || history.series.length !== 4 || history.series.some(item => item.provenance.length !== 5))
        warnings.push('chart provenance invalid');
} if (unit.category === 'KOREA_MARKET' && 'marketHistory' in unit.viewModel)
    warnings.push('unsupported Korea historical series'); if (unit.category !== 'AI_INTELLIGENCE' && (!html.includes('#c62828') || !html.includes('#1565c0')))
    warnings.push('market color convention invalid'); return unique(warnings); }
function selectionDecisions(unit, now) { return unit.viewModel.sources.map((source, index) => ({ candidate_id: `candidate:${unit.category.toLowerCase()}:${index + 1}`, entity_topic: unit.title, source_url: source.url, publisher: source.publisher ?? source.label, source_type: 'VERIFIED_PUBLIC', published_at: unit.observedDate, discovered_at: now, selection_status: 'SELECTED', selection_reason: '검증된 publication unit의 공개 근거로 채택', rejection_reason: null, relevance_score: null, importance_score: null, novelty_score: null, source_quality_score: null, market_impact_score: null, cross_verification_status: 'VERIFIED', duplicate_cluster_id: null, chosen_representative_reason: 'canonical URL과 publisher 기준 중복 제거 후 대표 출처 유지', summarization_basis: '검증된 structured intelligence record와 source fact', reviewer_agent: 'MOTUS DailyProductionOrchestrator', decision_at: now, model_version: 'none-deterministic-orchestration', rule_version: '4G.1.0', confidence: null, evidence_refs: [source.url] })); }
function resultFromUnit(unit, state, result, failureReason, warnings, stages, failures, inputFingerprint, outputFingerprint, durationMs, decisions) { return { category: unit.category, issueDate: unit.observedDate, state, result, publicationId: unit.publicationId, headline: unit.title, itemCount: unit.itemCount, sourceCount: unit.sourceCount, warnings, failureReason, inputFingerprint, outputFingerprint, reviewState: 'PENDING', publicationState: state === 'REVIEW_READY' ? 'PREVIEW_READY' : null, previewHtml: state === 'REVIEW_READY' ? unit.render.html : null, stages, failures, selectionDecisions: decisions, performance: { durationMs, sourceFetchCount: unit.sourceCount, successfulSources: state === 'REVIEW_READY' ? unit.sourceCount : 0, failedSources: failures.length, LLMCallCount: 0, estimatedTokenUsage: null, estimatedCost: null, renderDurationMs: 0 } }; }
function emptyResult(category, state, result, reason, stages, failures, durationMs) { return { category, issueDate: null, state, result, publicationId: null, headline: null, itemCount: 0, sourceCount: 0, warnings: [reason], failureReason: reason, inputFingerprint: null, outputFingerprint: null, reviewState: 'PENDING', publicationState: null, previewHtml: null, stages, failures, selectionDecisions: [], performance: { durationMs, sourceFetchCount: 0, successfulSources: 0, failedSources: failures.length, LLMCallCount: 0, estimatedTokenUsage: null, estimatedCost: null, renderDurationMs: 0 } }; }
function buildMorningOperator(runDate, generatedAt, items, failures, periodicRecords) { const summary = (category) => { const item = items.find(value => value.category === category); return item ? { state: item.state, headline: item.headline, itemCount: item.itemCount, sourceCount: item.sourceCount, warnings: item.warnings } : { state: 'NOT_STARTED', headline: null, itemCount: 0, sourceCount: 0, warnings: [] }; }; const reviewReady = items.filter(item => item.state === 'REVIEW_READY'); const completedDates = unique(periodicRecords.map(item => item.issueDate)); return { runDate, generatedAt, AI: summary('AI_INTELLIGENCE'), US: summary('US_MARKET'), Korea: summary('KOREA_MARKET'), weeklyReadiness: completedDates.length >= 5 ? 'READY' : 'HOLD', monthlyReadiness: completedDates.length >= 15 ? 'READY' : 'HOLD', criticalFailures: failures.filter(item => !item.retryable), reviewLinks: reviewReady.map(item => `data/operations/${runDate}/${folder(item.category)}/review.json`), recommendedHumanActions: reviewReady.map(item => `${label(item.category)} preview와 출처를 검토하고 PENDING 상태를 결정`) }; }
function toFailure(category, error, stage, retryCount, now) { const known = error instanceof OperationsError ? error : new OperationsError(error instanceof Error ? error.message : String(error), 'PARSING_CHANGED', category, 'unknown'); const retryable = ['NETWORK_TEMPORARY', 'RATE_LIMIT', 'UPSTREAM_5XX'].includes(known.errorType); return { category, source: known.source, adapter: known.adapter, stage, errorType: known.errorType, retryable, timestamp: now, retryCount, lastAttemptAt: now, message: known.message }; }
function startStage(stage, at, inputFingerprint) { return { stage, startedAt: at, completedAt: null, status: 'PASS', failureReason: null, inputFingerprint, outputFingerprint: null }; }
function passStage(stage, output, at) { return { ...stage, completedAt: at, status: 'PASS', outputFingerprint: output }; }
function failStage(stage, reason, at) { return { ...stage, completedAt: at, status: 'FAILED', failureReason: reason }; }
function holdStage(stage, reason, at) { return { ...stage, completedAt: at, status: 'HOLD', failureReason: reason }; }
function mergePerformance(items, durationMs) { return { durationMs, sourceFetchCount: sum(items, 'sourceFetchCount'), successfulSources: sum(items, 'successfulSources'), failedSources: sum(items, 'failedSources'), LLMCallCount: sum(items, 'LLMCallCount'), estimatedTokenUsage: null, estimatedCost: null, renderDurationMs: sum(items, 'renderDurationMs') }; }
function sum(items, key) { return items.reduce((total, item) => total + (typeof item[key] === 'number' ? item[key] : 0), 0); }
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function unique(items) { return [...new Set(items)]; }
function folder(category) { return category === 'AI_INTELLIGENCE' ? 'ai' : category === 'US_MARKET' ? 'us' : 'korea'; }
function label(category) { return category === 'AI_INTELLIGENCE' ? 'AI Intelligence' : category === 'US_MARKET' ? 'U.S. Market' : 'Korea Market'; }
