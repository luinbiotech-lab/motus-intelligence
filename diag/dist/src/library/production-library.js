import { buildGoldenIntelligenceRehearsal } from '../intelligence/golden-rehearsal.js';
import { createFirstSplitDailyProductionRun } from '../intelligence/split-daily-production.js';
import { buildCompanyHistory, buildOperatorPackage, buildThemeHistory, createEmptyLibrary, generateEvergreenCandidates, ingestNewsletter } from './content-library.js';
export function ingestDailyOperationsAudit(base, run) {
    const store = structuredClone(base);
    for (const category of run.categories)
        for (const item of category.selectionDecisions) {
            const decision = item.selection_status === 'SELECTED' ? 'SELECTED' : item.selection_status === 'REJECTED' ? 'REJECTED' : 'DEFERRED';
            const decisionId = `decision:${item.candidate_id}:${item.decision_at}`;
            if (!store.decisions.some(existing => existing.decisionId === decisionId))
                store.decisions.push({ decisionId, originRecordId: item.candidate_id, decision, reason: item.selection_reason || item.rejection_reason || 'editorial decision', at: item.decision_at });
        }
    return store;
}
export function buildVerifiedProductionLibrary(generatedAt = '2026-10-02T09:00:00+09:00') {
    const golden = buildGoldenIntelligenceRehearsal().newsletter;
    let store = createEmptyLibrary(generatedAt);
    const ingestions = [];
    const first = ingestNewsletter(store, golden, { observedAt: '2026-09-29T23:59:00Z', publicationId: 'motus-daily-intelligence-2026-09-29', publicationTitle: golden.title, decision: 'SELECTED', decisionReason: 'verified Golden Intelligence production record', pdfArtifact: { artifactId: 'report:daily-ai-2026-09-29', path: 'data/reports/daily/2026-09-29/ai/report.pdf' } });
    store = first.store;
    ingestions.push(first);
    const split = createFirstSplitDailyProductionRun(generatedAt);
    const us = split.units.find(unit => unit.category === 'US_MARKET')?.viewModel;
    const korea = split.units.find(unit => unit.category === 'KOREA_MARKET')?.viewModel;
    if (!us || !korea)
        throw new Error('verified 2026-09-30 production records unavailable');
    const usResult = ingestNewsletter(store, usNewsletter(us), { observedAt: '2026-09-30T23:59:00Z', publicationId: us.publicationId, publicationTitle: us.title, decision: 'SELECTED', decisionReason: 'verified split Daily production record', pdfArtifact: { artifactId: 'report:daily-us-2026-09-30', path: 'data/reports/daily/2026-09-30/us/report.pdf' } });
    store = usResult.store;
    ingestions.push(usResult);
    const koreaResult = ingestNewsletter(store, koreaNewsletter(korea), { observedAt: '2026-09-30T23:59:30Z', publicationId: korea.publicationId, publicationTitle: korea.title, decision: 'SELECTED', decisionReason: 'verified split Daily production record', pdfArtifact: { artifactId: 'report:daily-korea-2026-09-30', path: 'data/reports/daily/2026-09-30/korea/report.pdf' } });
    store = koreaResult.store;
    ingestions.push(koreaResult);
    store.themeHistory = store.records.filter(record => record.recordType === 'THEME').map(record => buildThemeHistory(store, record.canonicalId, '2026-09-29', '2026-09-30'));
    store.companyHistory = store.records.filter(record => record.recordType === 'COMPANY').map(record => buildCompanyHistory(store, record.canonicalId, '2026-09-29', '2026-09-30'));
    store.evergreenCandidates = generateEvergreenCandidates(store);
    const summary = { newRecordIds: ingestions.flatMap(item => item.newRecordIds), updatedRecordIds: ingestions.flatMap(item => item.updatedRecordIds), reviewRequired: ingestions.flatMap(item => item.reviewRequired) };
    return { store, ingestions, operator: buildOperatorPackage(store, summary, generatedAt) };
}
function usNewsletter(view) {
    const entry = { intelligenceId: 'intelligence:us-market-close-2026-09-30', headline: view.title, summary: view.marketSummary, company: null, companyId: null, primaryThemeId: 'theme:higher-for-longer', relatedThemeIds: ['theme:market-volatility'], eventId: 'event:us-market-close-2026-09-30', institutionView: view.wallStreetResearch[0]?.institutionView ?? null, aiInterpretation: view.wallStreetResearch[0]?.motusInterpretation ?? null, sourceFacts: view.wallStreetResearch.flatMap(item => item.facts), sources: view.sources, assetIds: [] };
    return { newsletterId: view.publicationId, issueDate: view.issueDate, issueNumber: view.issueNumber, title: view.title, subtitle: view.subtitle, editorialSummary: view.marketSummary, marketSnapshot: { summary: view.marketSummary, metrics: view.supportingMetrics, marketHistory: view.marketHistory }, wallStreetIntelligence: [entry], whatToWatch: view.checkpoints, sources: view.sources, assets: [] };
}
function koreaNewsletter(view) {
    const metrics = [...view.indexMetrics, ...view.fxAndSupporting, ...view.investorFlows, ...view.sectors, ...view.movers];
    const entry = { intelligenceId: 'intelligence:korea-market-close-2026-09-30', headline: view.title, summary: view.marketSummary, company: null, companyId: null, primaryThemeId: 'theme:ai-infrastructure', relatedThemeIds: [], eventId: 'event:korea-market-close-2026-09-30', institutionView: null, aiInterpretation: null, sourceFacts: metrics.map(item => `${item.label} ${item.displayValue}`), sources: view.sources, assetIds: [] };
    return { newsletterId: view.publicationId, issueDate: view.issueDate, issueNumber: view.issueNumber, title: view.title, subtitle: view.subtitle, editorialSummary: view.marketSummary, koreaMarketFacts: { asOf: `${view.issueDate}T15:30:00+09:00`, metrics, sources: view.sources.map(source => ({ label: source.label, url: source.url })) }, koreaResearch: view.research, koreaMarketIntelligence: [entry], whatToWatch: view.checkpoints, sources: view.sources, assets: [] };
}
