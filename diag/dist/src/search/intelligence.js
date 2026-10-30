import { createHash } from 'node:crypto';
export function normalizeNaverDataLab(input) {
    const byLabel = new Map(input.topics.flatMap(topic => [topic.label, ...topic.aliases].map(value => [normalize(value), topic])));
    return input.response.results.flatMap(result => {
        const topic = byLabel.get(normalize(result.title)) ?? result.keywords.map(value => byLabel.get(normalize(value))).find(Boolean);
        if (!topic)
            return [];
        if (!result.data.length || result.data.some(item => !dateLike(item.period) || !Number.isFinite(item.ratio) || item.ratio < 0 || item.ratio > 100))
            throw new Error('NAVER_DATALAB_RESPONSE_INVALID');
        const query = result.keywords.find(value => matchesTopic(value, topic)) ?? result.title;
        return [{ signalId: id('naver', topic.topicId, input.response.startDate, input.response.endDate), provider: 'NAVER_DATALAB', topicId: topic.topicId, query, periodStart: input.response.startDate, periodEnd: input.response.endDate, observedAt: result.data.at(-1).period, collectedAt: input.collectedAt, metrics: { relativeRatios: result.data.map(item => item.ratio), clicks: null, impressions: null, ctr: null, averagePosition: null }, provenance: { provider: 'NAVER_DATALAB', method: 'POST /v1/datalab/search', propertyId: null, sourceUrl: 'https://openapi.naver.com/v1/datalab/search' }, verificationStatus: 'VERIFIED' }];
    });
}
export function normalizeSearchConsoleDemand(input) {
    const grouped = new Map();
    for (const record of input.records) {
        if (record.provider !== 'GOOGLE_SEARCH_CONSOLE' || record.verificationStatus !== 'VERIFIED' || !record.query)
            continue;
        const topic = input.topics.find(item => matchesTopic(record.query, item));
        if (!topic)
            continue;
        const key = `${topic.topicId}\u0000${normalize(record.query)}`;
        grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }
    return [...grouped.entries()].map(([key, records]) => {
        const [topicId, query] = key.split('\u0000');
        const clicks = sum(records, 'clicks'), impressions = sum(records, 'impressions');
        return { signalId: id('gsc', topicId, query, input.periodStart, input.periodEnd), provider: 'GOOGLE_SEARCH_CONSOLE', topicId, query, periodStart: input.periodStart, periodEnd: input.periodEnd, observedAt: [...records].sort((a, b) => b.date.localeCompare(a.date))[0].date, collectedAt: input.collectedAt, metrics: { relativeRatios: null, clicks, impressions, ctr: impressions ? clicks / impressions : 0, averagePosition: impressions ? records.reduce((total, item) => total + item.averagePosition * item.impressions, 0) / impressions : null }, provenance: { provider: 'GOOGLE_SEARCH_CONSOLE', method: 'searchAnalytics.query', propertyId: records[0].propertyId, sourceUrl: 'https://developers.google.com/webmaster-tools/v1/searchanalytics/query' }, verificationStatus: 'VERIFIED' };
    });
}
export function createSearchIntelligenceSnapshot(input) {
    const topics = dedupeTopics(input.topics);
    const validIds = new Set(topics.map(item => item.topicId));
    const signals = input.signals.filter(item => validIds.has(item.topicId) && item.verificationStatus === 'VERIFIED');
    const base = { generatedAt: input.generatedAt, topics, signals: [...new Map(signals.map(item => [item.signalId, item])).values()], providerStates: input.providerStates, warnings: [...new Set(input.warnings ?? [])], policy: { verificationPrecedesDemand: true, providerFailureNonBlocking: true, internalMetricsPublic: false, commerce: { enabled: false } } };
    return { ...base, snapshotId: `search-intelligence:${hash(base).slice(0, 16)}` };
}
export function buildPerformanceLearning(snapshot) { return snapshot.topics.map(topic => { const signals = snapshot.signals.filter(item => item.topicId === topic.topicId); return { topicId: topic.topicId, observedQueries: [...new Set(signals.map(item => item.query))], evidenceSignalIds: signals.map(item => item.signalId), editorialAction: signals.length ? 'CONSIDER_DEEPER_CONTEXT' : 'NO_ACTION', reviewRequired: true, changesFacts: false, changesPublicationGate: false }; }); }
export function matchesTopic(value, topic) { const query = normalize(value); return [topic.label, ...topic.aliases].some(term => { const candidate = normalize(term); return candidate.length >= 2 && (query.includes(candidate) || candidate.includes(query)); }); }
function normalize(value) { return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim(); }
function dedupeTopics(items) { const map = new Map(); for (const item of items) {
    if (!item.claimRefs.length || !item.sourceRefs.length)
        throw new Error('verified topic requires claim and source provenance');
    const prior = map.get(item.topicId);
    map.set(item.topicId, prior ? { ...prior, aliases: [...new Set([...prior.aliases, ...item.aliases])], claimRefs: [...new Set([...prior.claimRefs, ...item.claimRefs])], sourceRefs: [...new Set([...prior.sourceRefs, ...item.sourceRefs])] } : structuredClone(item));
} return [...map.values()]; }
function sum(records, key) { return records.reduce((total, item) => total + item[key], 0); }
function id(...parts) { return `demand:${hash(parts).slice(0, 20)}`; }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function dateLike(value) { return /^\d{4}-\d{2}(?:-\d{2})?$/.test(value); }
