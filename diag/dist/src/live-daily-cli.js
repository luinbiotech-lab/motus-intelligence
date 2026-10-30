import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFirstSplitDailyProductionRun } from './intelligence/split-daily-production.js';
import { InternalLiveDailyAdapter } from './operations/internal-live-daily.js';
import { HttpVerifiedDailyAdapter, LiveDailyCollector } from './operations/live-daily.js';
import { buildProductionVerification } from './production/verification-artifact.js';
const args = process.argv.slice(2), value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const date = value('--date') ?? kstDate(new Date()), name = value('--category') ?? '', sourceMode = (value('--source') ?? 'internal');
const controlledRecovery = args.includes('--controlled-recovery');
const categories = { ai: 'AI_INTELLIGENCE', us: 'US_MARKET', korea: 'KOREA_MARKET' }, category = categories[name];
if (!category)
    throw new Error('category must be ai, us, or korea');
if (!['internal', 'http', 'snapshot'].includes(sourceMode))
    throw new Error('source must be internal, http, or snapshot');
if (controlledRecovery && (category !== 'KOREA_MARKET' || sourceMode !== 'internal'))
    throw new Error('--controlled-recovery is only valid for the internal Korea collector');
if (process.env.MOTUS_PRODUCTION_RUN === 'true' && sourceMode !== 'internal')
    throw new Error('production collection requires the internal verified adapter');
const at = value('--at') ?? new Date().toISOString(), root = join(process.cwd(), 'data', 'operations', date, name), unitPath = join(root, 'live-unit.json');
await mkdir(root, { recursive: true });
if (existsSync(unitPath))
    await unlink(unitPath);
const adapter = makeAdapter(sourceMode, category, at, controlledRecovery), collector = new LiveDailyCollector(adapter, () => at);
let state = 'HOLD', unit = null, error = null, audit = [], crossVerification = null, searchContext = null;
try {
    unit = await collector.collect(category);
    state = 'LIVE_READY';
    if (adapter instanceof InternalLiveDailyAdapter) {
        audit = adapter.lastAudit();
        const internalResult = adapter.lastResult();
        crossVerification = internalResult?.crossVerification ?? null;
        searchContext = internalResult?.searchContext ?? null;
    }
    else
        audit = unit.viewModel.sources.map((source, index) => ({ sourceId: `${sourceMode}:${index + 1}`, category, url: source.url, status: 'PASS', recordCount: 1, collectedAt: at, error: null }));
}
catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    if (adapter instanceof InternalLiveDailyAdapter) {
        audit = adapter.lastAudit();
        const internalResult = adapter.lastResult();
        state = internalResult?.state ?? 'HOLD';
        error = internalResult?.reason ?? error;
        crossVerification = internalResult?.crossVerification ?? null;
        searchContext = internalResult?.searchContext ?? null;
    }
    if (/holiday/i.test(error))
        state = 'SKIP';
}
// Search-demand is an editorial ranking input, not a source-of-truth verification gate.
// Keep provider errors in search-intelligence.json but never allow SEO provider outages to
// override independently verified source, market, editorial, or duplicate-publication gates.
const searchDegraded = Boolean(searchContext && (searchContext.fallbackReason === 'SEARCH_PROVIDER_NOT_CONFIGURED' || searchContext.warnings.some(item => item.startsWith('NAVER_DATALAB:'))));
if (searchDegraded)
    console.warn('SEARCH_DEMAND_DEGRADED: provider unavailable; verified editorial order retained');
let verification;
if (unit) {
    const payload = { schemaVersion: '1.0', session: { state: 'COMPLETED', observedDate: unit.observedDate, completedAt: at }, unit };
    verification = buildProductionVerification(payload, sourceMode, audit, at, crossVerification, date);
    if (verification.verification !== 'VERIFIED') {
        state = 'HOLD';
        error = verification.unresolvedConflicts.join('; ');
    }
}
else
    verification = { schemaVersion: '1.1', category, operationDate: date, observedDate: date, sourceMode, verification: 'FAILED', unresolvedConflicts: [error ?? 'live collection failed'], provenancePass: false, sourceDiversityPass: false, sourceLinksPass: false, mobilePass: false, editorialQualityPass: false, leakagePass: true, duplicateCheck: 'PENDING_REMOTE', duplicateUncertainty: true, articleFingerprint: '', commerceEnabled: false, verifiedAt: at, expiresAt: new Date(Date.parse(at) + 90 * 60 * 1000).toISOString(), sourceAuditIds: audit.filter(item => item.status === 'PASS').map(item => item.sourceId), sourceAuditFingerprint: hash(audit), crossVerificationFingerprint: crossVerification ? hash(crossVerification) : null, crossVerification };
const editorialPlan = { category, operationDate: date, observedDate: unit?.observedDate ?? null, state: state === 'LIVE_READY' ? 'AUTO_POLICY_CANDIDATE' : 'HOLD', searchDemandMayOverride: false, articleFingerprint: verification.articleFingerprint, commerce: { enabled: false } };
const liveUnitArtifact = unit ?? { schemaVersion: '1.0', category, operationDate: date, status: state, observedDate: null, reasonCode: error ?? 'LIVE_UNIT_UNAVAILABLE', unit: null };
const writes = [writeFile(unitPath, JSON.stringify(liveUnitArtifact, null, 2) + '\n', 'utf8'), writeFile(join(root, 'live-source-audit.json'), JSON.stringify({ schemaVersion: '1.0', sourceMode, category, operationDate: date, status: state, reasonCode: error, entries: audit }, null, 2) + '\n', 'utf8'), writeFile(join(root, 'verification.json'), JSON.stringify(verification, null, 2) + '\n', 'utf8'), writeFile(join(root, 'editorial-plan.json'), JSON.stringify(editorialPlan, null, 2) + '\n', 'utf8'), writeFile(join(root, 'search-intelligence.json'), JSON.stringify(searchContext ?? { collectedAt: at, signalDate: null, provider: null, freshness: 'NO_SEARCH_SIGNAL', fallbackReason: 'NO_PRE_RENDER_SEARCH_CONTEXT', warnings: [], orderedTopicIds: [], selectedSecondaryTopicId: null, factsChanged: false, gateOverride: false }, null, 2) + '\n', 'utf8')];
if (category === 'KOREA_MARKET')
    writes.push(writeFile(join(root, 'cross-verification.json'), JSON.stringify(crossVerification ?? { schemaVersion: '1.0', category: 'KOREA_MARKET', observedDate: null, comparisonResult: 'UNAVAILABLE', sourceDiversityPass: false, verification: 'REVIEW_REQUIRED', reasonCodes: [error ?? 'KOREA_CROSS_VERIFICATION_UNAVAILABLE'], verifiedAt: at }, null, 2) + '\n', 'utf8'));
await Promise.all(writes);
const result = { mode: 'LIVE', sourceMode, date, observedDate: unit?.observedDate ?? null, category, state, reasonCode: error, verification: verification.verification, publishCallCount: 0, commerce: { enabled: false } };
await writeFile(join(root, 'live-collection.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(result));
function makeAdapter(mode, requestedCategory, requestedAt, controlledRecovery) { if (mode === 'internal')
    return new InternalLiveDailyAdapter(undefined, { mode: controlledRecovery ? 'ADMIN_CONTROLLED_RECOVERY' : 'SCHEDULED' }); if (mode === 'http')
    return new HttpVerifiedDailyAdapter(); const unit = structuredClone(createFirstSplitDailyProductionRun().units.find(item => item.category === requestedCategory)); return { adapterId: 'snapshot-regression-only', async fetch() { return { schemaVersion: '1.0', session: { state: 'COMPLETED', observedDate: unit.observedDate, completedAt: requestedAt }, unit }; } }; }
function kstDate(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function hash(value) { return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
