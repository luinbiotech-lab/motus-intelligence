import { IntelligenceRetrievalService, buildRetrievalOperatorPackage, buildSourceOperationalProfiles, createDefaultEditorialMemory, detectKnowledgeConflicts, enhanceEvergreenReview, retrieveEditorialMemory } from './retrieval.js';
export function buildSampleRetrievalRun(store, generatedAt = '2026-10-06T09:00:00+09:00', memory = createDefaultEditorialMemory(generatedAt)) {
    const service = new IntelligenceRetrievalService(store, generatedAt);
    const openAIResult = service.byCompany('company:openai');
    const nvidiaResult = service.byCompany('company:nvidia');
    const themeResult = service.byTheme('theme:agentic-ai');
    const openAITimeline = service.timeline('COMPANY', 'company:openai');
    const nvidiaRetrospective = service.companyRetrospective('company:nvidia', '2026-09-01', '2026-10-06');
    const themeRetrospective = service.themeRetrospective('theme:agentic-ai', '2026-09-01', '2026-10-06');
    const samsungSecuritiesHistory = service.institutionViewHistory('institution:samsung-securities', 'INSTITUTION', 'institution:samsung-securities');
    const openAIPrecedents = service.findPrecedents('event:openai-dots-2026-09-29');
    const openAIEvent = store.records.find(record => record.canonicalId === 'event:openai-dots-2026-09-29');
    const priorCoverage = [service.findPriorCoverage({ eventId: 'event:openai-dots-2026-09-29', sourceRefs: openAIEvent?.sourceRefs ?? [], observedAt: generatedAt }), service.findPriorCoverage({ continuationOfEventId: 'event:openai-dots-2026-09-29', observedAt: generatedAt })];
    let nextMemory = memory;
    const used = [];
    for (const context of [{ subjectType: 'COMPANY', subjectId: 'company:openai' }, { subjectType: 'COMPANY', subjectId: 'company:nvidia' }, { subjectType: 'THEME', subjectId: 'theme:agentic-ai' }]) {
        const recalled = retrieveEditorialMemory(nextMemory, context, generatedAt);
        nextMemory = recalled.store;
        used.push(...recalled.records);
    }
    const conflicts = detectKnowledgeConflicts(store, generatedAt);
    const evergreenReviews = store.evergreenCandidates.map(candidate => enhanceEvergreenReview(store, candidate, generatedAt));
    const sourceOperational = buildSourceOperationalProfiles(store.records.filter(record => record.recordType === 'SOURCE').map(record => ({ publisher: String(record.internalMetadata.publisher ?? record.displayName), sourceType: 'VERIFIED_LIBRARY_SOURCE', status: 'SUCCESS', observedAt: record.lastSeenAt })));
    const operator = buildRetrievalOperatorPackage({ generatedAt, results: [openAIResult, nvidiaResult, themeResult], conflicts, coverage: priorCoverage, precedents: [openAIPrecedents], memoryUsed: used, store });
    return { generatedAt, openAITimeline, nvidiaRetrospective, themeRetrospective, samsungSecuritiesHistory, openAIPrecedents, priorCoverage, evergreenReviews, memory: nextMemory, sourceOperational, conflicts, operator };
}
