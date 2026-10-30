import { createHash } from 'node:crypto';
export const LIBRARY_SCHEMA_VERSION = '1.0.0';
export const recordTypes = ['EVENT', 'COMPANY', 'THEME', 'SECTOR', 'INSTITUTION', 'MARKET', 'PUBLICATION', 'RESEARCH', 'SOURCE'];
const uniq = (values) => [...new Set(values.filter(Boolean))].sort();
const key = (value) => value.normalize('NFKC').toLowerCase().replace(/(?:corporation|corp\.?|inc\.?|주식회사|㈜)/g, '').replace(/[^a-z0-9가-힣]/g, '');
const slug = (value) => value.normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);
const canonicalUrl = (value) => { const u = new URL(value); u.hash = ''; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(k => u.searchParams.delete(k)); u.hostname = u.hostname.toLowerCase(); return u.toString().replace(/\/$/, ''); };
const iso = (value) => { if (!Number.isFinite(Date.parse(value)))
    throw new Error(`invalid date: ${value}`); return value; };
const provenance = (sourceRefs, evidenceRefs, originRecordIds) => ({ sourceRefs: uniq(sourceRefs), evidenceRefs: uniq(evidenceRefs), originRecordIds: uniq(originRecordIds) });
const REGISTRIES = {
    company: [
        reg('company:nvidia', 'NVIDIA', ['Nvidia', 'NVIDIA Corp.', 'NVDA']), reg('company:microsoft', 'Microsoft', ['Microsoft Corp.', 'MSFT']), reg('company:openai', 'OpenAI', []), reg('company:meta', 'Meta Platforms', ['Meta', 'META']), reg('company:anthropic', 'Anthropic', []), reg('company:samsung-electronics', '삼성전자', ['Samsung Electronics', '005930']), reg('company:sk-hynix', 'SK하이닉스', ['SK Hynix', '000660']), reg('company:lg-energy-solution', 'LG에너지솔루션', ['LG Energy Solution', '373220']), reg('company:mongodb', 'MongoDB', ['MDB'])
    ],
    theme: [
        reg('theme:agentic-ai', 'Agentic AI', ['agentic ai', 'AI agent', 'AI agents', '에이전트 AI']), reg('theme:ai-infrastructure', 'AI Infrastructure', ['ai infrastructure', 'AI 데이터센터', 'Datacenter AI']), reg('theme:ai-for-science', 'AI for Science', ['ai for science']), reg('theme:agent-security', 'Agent Security', ['agent security', 'AI 보안']), reg('theme:ai-interface', 'AI Interface', ['ai interface']), reg('theme:higher-for-longer', 'Higher-for-longer rates', ['higher for longer', '장기금리']), reg('theme:market-volatility', 'Market Volatility', ['VIX', '시장 변동성'])
    ],
    sector: [reg('sector:semiconductors', 'Semiconductors', ['반도체', 'AI 반도체']), reg('sector:software', 'Software', ['소프트웨어']), reg('sector:communication-services', 'Communication Services', ['커뮤니케이션 서비스']), reg('sector:financials', 'Financials', ['금융']), reg('sector:insurance', 'Insurance', ['보험']), reg('sector:energy', 'Energy', ['에너지'])],
    institution: [reg('institution:samsung-securities', '삼성증권', ['Samsung Securities']), reg('institution:associated-press', 'Associated Press', ['AP']), reg('institution:reuters', 'Reuters', []), reg('institution:us-treasury', 'U.S. Department of the Treasury', ['U.S. Treasury']), reg('institution:cboe', 'Cboe', []), reg('institution:microsoft-research', 'Microsoft Research', [])],
    market: [reg('market:us', 'United States', ['US', 'U.S.', '미국']), reg('market:korea', 'Korea', ['KR', '한국']), reg('market:global', 'Global', ['글로벌'])]
};
function reg(canonicalId, displayName, aliases) { return { canonicalId, canonicalName: displayName, displayName, aliases: uniq([displayName, ...aliases]), status: 'VERIFIED', redirectTo: null }; }
const AMBIGUOUS = { [key('Samsung')]: ['company:samsung-electronics', 'institution:samsung-securities'] };
export function getCanonicalRegistry(type) { return structuredClone(REGISTRIES[type]); }
export function resolveCanonical(type, value) {
    const ambiguous = AMBIGUOUS[key(value)];
    if (ambiguous)
        return { canonicalId: null, status: 'REVIEW_REQUIRED', candidates: ambiguous };
    const matches = REGISTRIES[type].filter(item => [item.canonicalId, item.canonicalName, item.displayName, ...item.aliases].some(alias => key(alias) === key(value)));
    if (matches.length === 1)
        return { canonicalId: matches[0].canonicalId, status: 'RESOLVED', candidates: [] };
    if (matches.length > 1)
        return { canonicalId: null, status: 'REVIEW_REQUIRED', candidates: matches.map(item => item.canonicalId) };
    return { canonicalId: null, status: 'NOT_FOUND', candidates: [] };
}
export function createEmptyLibrary(generatedAt = new Date().toISOString()) { return { schemaVersion: LIBRARY_SCHEMA_VERSION, generatedAt, records: [], edges: [], themeHistory: [], companyHistory: [], evergreenCandidates: [], decisions: [], audienceSignals: [], pdfArtifacts: [], redirects: {} }; }
export function ingestNewsletter(base, model, options) {
    const store = structuredClone(base);
    const now = iso(options.observedAt);
    const newIds = [];
    const updatedIds = [];
    const reviewRequired = [];
    let sourceDuplicates = 0, eventDuplicates = 0, entityDuplicates = 0;
    const upsert = (input) => {
        const libraryId = `library:${input.recordType.toLowerCase()}:${input.canonicalId.replace(/^[^:]+:/, '')}`;
        const found = store.records.find(r => r.libraryId === libraryId);
        if (found) {
            entityDuplicates++;
            found.aliases = uniq([...found.aliases, ...input.aliases]);
            found.sourceRefs = uniq([...found.sourceRefs, ...input.sourceRefs]);
            found.evidenceRefs = uniq([...found.evidenceRefs, ...input.evidenceRefs]);
            found.originRecordIds = uniq([...found.originRecordIds, ...input.originRecordIds]);
            found.internalMetadata = mergeMetadata(found.internalMetadata, input.internalMetadata);
            if (input.publicMetadata)
                found.publicMetadata = { ...(found.publicMetadata ?? {}), ...input.publicMetadata };
            found.lastSeenAt = maxDate(found.lastSeenAt, now);
            found.updatedAt = now;
            if (input.summary)
                found.summary = input.summary;
            updatedIds.push(libraryId);
            return found;
        }
        const created = { ...input, libraryId, firstSeenAt: now, lastSeenAt: now, createdAt: now, updatedAt: now };
        store.records.push(created);
        newIds.push(libraryId);
        if (created.verificationStatus === 'REVIEW_REQUIRED')
            reviewRequired.push(libraryId);
        return created;
    };
    const sourceIdByUrl = new Map(store.records.filter(r => r.recordType === 'SOURCE').map(r => [String(r.internalMetadata.canonicalUrl), r.canonicalId]));
    const addSource = (source, origin) => { const url = canonicalUrl(source.url); const existing = sourceIdByUrl.get(url); if (existing) {
        sourceDuplicates++;
        const record = store.records.find(r => r.canonicalId === existing);
        record.originRecordIds = uniq([...record.originRecordIds, origin]);
        return existing;
    } const id = `source:${hash(url)}`; sourceIdByUrl.set(url, id); upsert({ recordType: 'SOURCE', canonicalId: id, canonicalName: source.label, displayName: source.label, aliases: [], summary: null, status: 'ACTIVE', verificationStatus: 'VERIFIED', confidence: null, ...provenance([id], [`evidence:${hash(`${url}|${origin}`)}`], [origin]), internalMetadata: { canonicalUrl: url, publisher: source.publisher }, publicMetadata: { url } }); return id; };
    const publicationSources = model.sources.map(s => addSource(s, options.publicationId));
    upsert({ recordType: 'PUBLICATION', canonicalId: options.publicationId, canonicalName: options.publicationTitle, displayName: options.publicationTitle, aliases: [], summary: model.editorialSummary, status: 'ACTIVE', verificationStatus: 'VERIFIED', confidence: null, ...provenance(publicationSources, [], [model.newsletterId]), internalMetadata: { issueDate: model.issueDate, decision: options.decision ?? 'SELECTED' }, publicMetadata: { issueDate: model.issueDate } });
    addMarket('market:global', 'Global', options.publicationId, publicationSources);
    const entries = [...(model.aiIntelligence ?? []).map(i => ({ item: i, kind: 'AI' })), ...(model.wallStreetIntelligence ?? []).map(i => ({ item: i, kind: 'WALL_STREET' }))];
    for (const { item, kind } of entries) {
        const itemSources = item.sources.map(s => addSource(s, item.intelligenceId));
        const evidence = item.sourceFacts.map((fact, index) => `evidence:${hash(`${item.intelligenceId}|${index}|${fact}`)}`);
        let companyId = item.companyId;
        if (!companyId && item.company) {
            const resolved = resolveCanonical('company', item.company);
            companyId = resolved.canonicalId;
            if (resolved.status === 'REVIEW_REQUIRED')
                reviewRequired.push(`alias:${item.company}`);
        }
        if (companyId)
            addEntity('COMPANY', companyId, item.company ?? companyId, itemSources, evidence, item.intelligenceId, item.summary);
        const themes = uniq([item.primaryThemeId ?? '', ...item.relatedThemeIds]);
        for (const themeId of themes)
            addEntity('THEME', themeId, titleFromId(themeId), itemSources, evidence, item.intelligenceId, item.summary);
        if (item.eventId) {
            const existing = store.records.some(r => r.recordType === 'EVENT' && r.canonicalId === item.eventId);
            if (existing)
                eventDuplicates++;
            addEntity('EVENT', item.eventId, item.headline, itemSources, evidence, item.intelligenceId, item.summary, { eventType: kind, eventDate: model.issueDate, companyIds: companyId ? [companyId] : [], themeIds: themes, marketIds: kind === 'WALL_STREET' ? ['market:us'] : ['market:global'], wallStreetViews: item.institutionView ? [item.institutionView] : [], koreaResearchViews: [] });
            for (const themeId of themes)
                addEdge(item.eventId, themeId, 'EVENT_RELATES_THEME', `verified ${kind} item declared theme`, itemSources, evidence, [item.intelligenceId]);
            if (companyId)
                addEdge(item.eventId, companyId, 'EVENT_INVOLVES_COMPANY', `verified ${kind} item declared company`, itemSources, evidence, [item.intelligenceId]);
            addEdge(options.publicationId, item.eventId, 'PUBLICATION_COVERS_EVENT', 'publication view model includes event', itemSources, evidence, [model.newsletterId]);
        }
        for (const themeId of themes) {
            if (companyId)
                addEdge(companyId, themeId, 'COMPANY_HAS_THEME', 'verified intelligence item links company and theme', itemSources, evidence, [item.intelligenceId]);
            addEdge(options.publicationId, themeId, 'PUBLICATION_COVERS_THEME', 'publication view model includes theme', itemSources, evidence, [model.newsletterId]);
        }
        if (companyId)
            addEdge(options.publicationId, companyId, 'PUBLICATION_COVERS_COMPANY', 'publication view model includes company', itemSources, evidence, [model.newsletterId]);
    }
    for (const research of model.koreaResearch ?? []) {
        const sources = research.sources.map(s => addSource(s, research.researchId));
        const evidence = research.evidence.map((fact, index) => `evidence:${hash(`${research.researchId}|${index}|${fact}`)}`);
        const institution = resolveCanonical('institution', research.publisher).canonicalId ?? `institution:${slug(research.publisher)}`;
        addEntity('INSTITUTION', institution, research.publisher, sources, evidence, research.researchId, null, { institutionType: 'BROKERAGE' });
        addEntity('RESEARCH', research.researchId, research.headline, sources, evidence, research.researchId, research.summary, { publisher: research.publisher, institutionView: research.institutionView, aiInterpretation: research.aiInterpretation, riskFactors: research.riskFactors });
        addEdge(institution, research.researchId, 'INSTITUTION_PUBLISHED_RESEARCH', 'verified publication provenance', sources, evidence, [research.researchId]);
        for (const interest of research.interests) {
            const c = resolveCanonical('company', interest);
            const t = resolveCanonical('theme', interest);
            const s = resolveCanonical('sector', interest);
            if (c.canonicalId) {
                addEntity('COMPANY', c.canonicalId, interest, sources, evidence, research.researchId, null);
                addEdge(research.researchId, c.canonicalId, 'RESEARCH_COVERS_COMPANY', 'structured research interest', sources, evidence, [research.researchId]);
            }
            else if (t.canonicalId) {
                addEntity('THEME', t.canonicalId, titleFromId(t.canonicalId), sources, evidence, research.researchId, null);
                addEdge(research.researchId, t.canonicalId, 'RESEARCH_COVERS_THEME', 'structured research interest', sources, evidence, [research.researchId]);
            }
            else if (s.canonicalId)
                addEntity('SECTOR', s.canonicalId, interest, sources, evidence, research.researchId, null);
        }
    }
    if (model.marketSnapshot)
        addMarket('market:us', 'United States', options.publicationId, publicationSources, model.marketSnapshot.metrics.map(m => `${m.label} ${m.value}${m.change ? ` ${m.change}` : ''}`));
    if (model.koreaMarketFacts)
        addMarket('market:korea', 'Korea', options.publicationId, model.koreaMarketFacts.sources.map(s => addSource({ ...s, publisher: null }, options.publicationId)), model.koreaMarketFacts.metrics.map(m => `${m.label} ${m.displayValue}`));
    if (options.decision) {
        store.decisions = upsertBy(store.decisions, { decisionId: `decision:${hash(`${options.publicationId}|${options.decision}|${now}`)}`, originRecordId: options.publicationId, decision: options.decision, reason: options.decisionReason ?? 'production selection audit', at: now }, 'decisionId');
    }
    if (options.pdfArtifact) {
        const companyIds = relatedIds(store, options.publicationId, 'PUBLICATION_COVERS_COMPANY');
        const themeIds = relatedIds(store, options.publicationId, 'PUBLICATION_COVERS_THEME');
        const eventIds = relatedIds(store, options.publicationId, 'PUBLICATION_COVERS_EVENT');
        store.pdfArtifacts = upsertBy(store.pdfArtifacts, { artifactId: options.pdfArtifact.artifactId, path: options.pdfArtifact.path, publicationId: options.publicationId, companyIds, themeIds, eventIds, publicUrl: null, createdAt: now }, 'artifactId');
    }
    store.generatedAt = now;
    return { store, newRecordIds: uniq(newIds), updatedRecordIds: uniq(updatedIds), sourceDuplicates, eventDuplicates, entityDuplicates, reviewRequired: uniq(reviewRequired) };
    function addEntity(type, id, name, sources, evidence, origin, summary, metadata = {}) { return upsert({ recordType: type, canonicalId: id, canonicalName: name, displayName: name, aliases: registryAliases(id), summary, status: 'ACTIVE', verificationStatus: 'VERIFIED', confidence: null, ...provenance(sources, evidence, [origin]), internalMetadata: metadata, publicMetadata: null }); }
    function addMarket(id, name, origin, sources, facts = []) { addEntity('MARKET', id, name, sources, [], origin, null, { facts, observations: facts.length ? [{ observedAt: now, facts, originRecordId: origin }] : [] }); }
    function addEdge(fromId, toId, relationshipType, reason, sources, evidence, origins) { if (!evidence.length && !sources.length)
        throw new Error('relationship evidence or source reference required'); const edgeId = `edge:${hash(`${fromId}|${relationshipType}|${toId}`)}`; const found = store.edges.find(e => e.edgeId === edgeId); if (found) {
        found.sourceRefs = uniq([...found.sourceRefs, ...sources]);
        found.evidenceRefs = uniq([...found.evidenceRefs, ...evidence]);
        found.originRecordIds = uniq([...found.originRecordIds, ...origins]);
        return;
    } store.edges.push({ edgeId, fromId, toId, relationshipType, reason, createdAt: now, ...provenance(sources, evidence, origins) }); }
}
export function recordDecision(store, input) { const next = structuredClone(store); const item = { ...input, decisionId: `decision:${hash(`${input.originRecordId}|${input.decision}|${input.at}`)}` }; next.decisions = upsertBy(next.decisions, item, 'decisionId'); if (input.decision === 'REJECTED')
    next.records = next.records.filter(r => !r.originRecordIds.includes(input.originRecordId) || r.recordType === 'SOURCE'); return next; }
export function attachAudienceSignal(store, signal) { const next = structuredClone(store); next.audienceSignals = upsertBy(next.audienceSignals, signal, 'publicationId'); return next; }
export function attachPdfArtifact(store, artifact) { const next = structuredClone(store); next.pdfArtifacts = upsertBy(next.pdfArtifacts, { ...artifact, publicUrl: null }, 'artifactId'); return next; }
export function createEvidenceEdge(input) { if (!input.evidenceRefs.length && !input.sourceRefs.length)
    throw new Error('relationship evidence or source reference required'); return { ...input, edgeId: `edge:${hash(`${input.fromId}|${input.relationshipType}|${input.toId}`)}` }; }
export function getRecordsByPeriod(store, type, from, to) { return store.records.filter(r => r.recordType === type && r.lastSeenAt.slice(0, 10) >= from && r.firstSeenAt.slice(0, 10) <= to).map(item => structuredClone(item)); }
export const getEventsByPeriod = (s, f, t) => getRecordsByPeriod(s, 'EVENT', f, t);
export const getCompaniesByPeriod = (s, f, t) => getRecordsByPeriod(s, 'COMPANY', f, t);
export const getThemesByPeriod = (s, f, t) => getRecordsByPeriod(s, 'THEME', f, t);
export const getInstitutionViewsByPeriod = (s, f, t) => getRecordsByPeriod(s, 'RESEARCH', f, t);
export function getMarketReactionsByPeriod(s, f, t) { return getRecordsByPeriod(s, 'MARKET', f, t).filter(r => Array.isArray(r.internalMetadata.facts) && r.internalMetadata.facts.length > 0); }
export function buildPeriodicLibraryAdapter(store, from, to) { return { events: getEventsByPeriod(store, from, to), companies: getCompaniesByPeriod(store, from, to), themes: getThemesByPeriod(store, from, to), institutionViews: getInstitutionViewsByPeriod(store, from, to), marketReactions: getMarketReactionsByPeriod(store, from, to) }; }
export function searchLibrary(store, query) {
    const text = query.text?.trim().toLowerCase();
    return store.records.filter(r => {
        if (query.recordType && r.recordType !== query.recordType)
            return false;
        if (query.dateRange && (r.lastSeenAt.slice(0, 10) < query.dateRange.from || r.firstSeenAt.slice(0, 10) > query.dateRange.to))
            return false;
        const ids = [query.company, query.theme, query.sector, query.institution, query.market].filter((v) => Boolean(v));
        if (ids.length && !ids.every(id => r.canonicalId === id || store.edges.some(e => (e.fromId === r.canonicalId && e.toId === id) || (e.toId === r.canonicalId && e.fromId === id))))
            return false;
        return !text || [r.canonicalName, r.displayName, r.summary ?? '', ...r.aliases].join(' ').toLowerCase().includes(text);
    }).map(item => structuredClone(item));
}
export function buildCompanyProfile(store, companyId) { const r = required(store, 'COMPANY', companyId); const edges = store.edges.filter(e => e.fromId === companyId || e.toId === companyId); const research = edges.filter(e => e.relationshipType === 'RESEARCH_COVERS_COMPANY').map(e => e.fromId); const institutions = store.edges.filter(e => e.relationshipType === 'INSTITUTION_PUBLISHED_RESEARCH' && research.includes(e.toId)).map(e => e.fromId); return { companyId, companyName: r.displayName, ticker: typeof r.internalMetadata.ticker === 'string' ? r.internalMetadata.ticker : null, market: typeof r.internalMetadata.market === 'string' ? r.internalMetadata.market : null, sectorIds: targets(edges, companyId, 'COMPANY_IN_SECTOR'), themeIds: targets(edges, companyId, 'COMPANY_HAS_THEME'), relatedEvents: sources(edges, companyId, 'EVENT_INVOLVES_COMPANY'), relatedResearch: uniq(research), relatedPublications: sources(edges, companyId, 'PUBLICATION_COVERS_COMPANY'), institutionMentions: uniq(institutions), marketReactions: [], firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt, latestVerifiedSummary: r.summary, ...provenance(r.sourceRefs, r.evidenceRefs, r.originRecordIds) }; }
export function buildThemeProfile(store, themeId) { const r = required(store, 'THEME', themeId); const edges = store.edges.filter(e => e.fromId === themeId || e.toId === themeId); const research = sources(edges, themeId, 'RESEARCH_COVERS_THEME'); const institutions = store.edges.filter(e => e.relationshipType === 'INSTITUTION_PUBLISHED_RESEARCH' && research.includes(e.toId)).map(e => e.fromId); return { themeId, themeName: r.displayName, aliases: r.aliases, relatedCompanyIds: sources(edges, themeId, 'COMPANY_HAS_THEME'), relatedSectorIds: targets(edges, themeId, 'THEME_RELATES_SECTOR'), relatedEventIds: sources(edges, themeId, 'EVENT_RELATES_THEME'), relatedInstitutionIds: uniq(institutions), firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt, currentState: null, priorState: null, supportingEvidence: r.evidenceRefs, publications: sources(edges, themeId, 'PUBLICATION_COVERS_THEME'), history: store.themeHistory.filter(h => h.themeId === themeId), ...provenance(r.sourceRefs, r.evidenceRefs, r.originRecordIds) }; }
export function buildEventProfile(store, eventId) { const r = required(store, 'EVENT', eventId); const m = r.internalMetadata; return { eventId, eventType: String(m.eventType ?? 'UNKNOWN'), headline: r.displayName, eventDate: String(m.eventDate ?? r.firstSeenAt.slice(0, 10)), companyIds: array(m.companyIds), themeIds: array(m.themeIds), sectorIds: array(m.sectorIds), marketIds: array(m.marketIds), primarySources: r.sourceRefs, secondarySources: [], wallStreetViews: array(m.wallStreetViews), koreaResearchViews: array(m.koreaResearchViews), initialMarketReaction: nullable(m.initialMarketReaction), subsequentMarketReaction: nullable(m.subsequentMarketReaction), relatedPublications: sources(store.edges, eventId, 'PUBLICATION_COVERS_EVENT'), verificationStatus: r.verificationStatus, confidence: r.confidence, ...provenance(r.sourceRefs, r.evidenceRefs, r.originRecordIds) }; }
export function buildInstitutionProfile(store, institutionId) { const r = required(store, 'INSTITUTION', institutionId); const research = targets(store.edges, institutionId, 'INSTITUTION_PUBLISHED_RESEARCH'); const covered = store.edges.filter(e => research.includes(e.fromId)); return { institutionId, institutionName: r.displayName, institutionType: r.internalMetadata.institutionType ?? 'OTHER', researchRecords: research, themes: uniq(covered.filter(e => e.relationshipType === 'RESEARCH_COVERS_THEME').map(e => e.toId)), companies: uniq(covered.filter(e => e.relationshipType === 'RESEARCH_COVERS_COMPANY').map(e => e.toId)), sectors: [], stanceHistory: research.map(id => String(required(store, 'RESEARCH', id).internalMetadata.institutionView ?? '')).filter(Boolean), ratingChanges: [], targetPriceChanges: [], firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt, ...provenance(r.sourceRefs, r.evidenceRefs, r.originRecordIds) }; }
export function buildMarketProfile(store, marketId) { const records = store.records.filter(r => r.recordType === 'MARKET' && r.canonicalId === marketId); const r = records[0]; if (!r)
    throw new Error(`MARKET ${marketId} not found`); const observations = Array.isArray(r.internalMetadata.observations) ? r.internalMetadata.observations : []; return { marketId, relatedEvents: sources(store.edges, marketId, 'EVENT_AFFECTED_MARKET'), relatedThemes: [], marketFacts: records.flatMap(item => array(item.internalMetadata.facts)), majorCompanies: [], institutionViews: [], publications: records.flatMap(item => item.originRecordIds.filter(id => id.startsWith('motus-'))), historicalSnapshots: uniq(observations.map(item => typeof item.observedAt === 'string' ? item.observedAt : '').filter(Boolean)), ...provenance(r.sourceRefs, r.evidenceRefs, r.originRecordIds) }; }
export function buildThemeHistory(store, themeId, periodStart, periodEnd, prior) { const profile = buildThemeProfile(store, themeId); const research = store.edges.filter(e => e.relationshipType === 'RESEARCH_COVERS_THEME' && e.toId === themeId).map(e => e.fromId); const institutions = store.edges.filter(e => e.relationshipType === 'INSTITUTION_PUBLISHED_RESEARCH' && research.includes(e.toId)).map(e => e.fromId); const eventCount = profile.relatedEventIds.length; const changeState = prior ? state(eventCount, prior.eventCount) : null; return { themeId, periodStart, periodEnd, eventCount, companyCount: profile.relatedCompanyIds.length, institutionCount: new Set(institutions).size, researchCount: new Set(research).size, marketCount: 0, supportingRecordIds: uniq([...profile.relatedEventIds, ...research]), changeState, ...provenance(profile.sourceRefs, profile.evidenceRefs, profile.originRecordIds) }; }
export function buildCompanyHistory(store, companyId, periodStart, periodEnd, prior) { const p = buildCompanyProfile(store, companyId); return { companyId, periodStart, periodEnd, events: p.relatedEvents, researchMentions: p.relatedResearch, institutionMentions: p.institutionMentions, marketReactions: p.marketReactions, relatedThemes: p.themeIds, attentionChange: prior ? state(p.relatedEvents.length + p.relatedResearch.length, prior.events.length + prior.researchMentions.length) : null, ...provenance(p.sourceRefs, p.evidenceRefs, p.originRecordIds) }; }
export function generateEvergreenCandidates(store) { const out = []; for (const theme of store.records.filter(r => r.recordType === 'THEME')) {
    const profile = buildThemeProfile(store, theme.canonicalId);
    const events = profile.relatedEventIds;
    const publications = profile.publications;
    const sourceCount = new Set(theme.sourceRefs).size;
    if (events.length >= 1 && sourceCount >= 2)
        out.push({ candidateId: `evergreen:${theme.canonicalId.replace(':', '-')}`, topicType: 'THEME', topicId: theme.canonicalId, reason: '반복 가능한 설명 주제이며 둘 이상의 독립 source 근거가 존재', supportingEvents: events, supportingPublications: publications, sourceCount, candidateState: 'REVIEW_REQUIRED', ...provenance(theme.sourceRefs, theme.evidenceRefs, theme.originRecordIds) });
} return out; }
export function buildTopicPageViewModel(store, themeId) { const p = buildThemeProfile(store, themeId); const latestEvents = p.relatedEventIds.map(id => buildEventProfile(store, id)).sort((a, b) => b.eventDate.localeCompare(a.eventDate)); return { title: p.themeName, summary: required(store, 'THEME', themeId).summary, latestEvents, relatedCompanies: p.relatedCompanyIds.map(id => buildCompanyProfile(store, id)), relatedResearch: getLinkedRecords(store, themeId, 'RESEARCH_COVERS_THEME'), relatedPublications: p.publications.map(id => required(store, 'PUBLICATION', id)), timeline: latestEvents.map(e => ({ date: e.eventDate, recordId: e.eventId, headline: e.headline })), sources: p.sourceRefs }; }
export function buildCompanyPageViewModel(store, companyId) { const p = buildCompanyProfile(store, companyId); return { company: p, themes: p.themeIds.map(id => buildThemeProfile(store, id)), latestEvents: p.relatedEvents.map(id => buildEventProfile(store, id)), institutionViews: p.institutionMentions.map(id => buildInstitutionProfile(store, id)), marketReactions: p.marketReactions, relatedReports: store.pdfArtifacts.filter(a => a.companyIds.includes(companyId)) }; }
export function buildOperatorPackage(store, ingestion, generatedAt = store.generatedAt) { const count = (type) => store.records.filter(r => r.recordType === type).length; const themeChanges = store.themeHistory.filter(h => h.changeState !== null).map(h => ({ id: h.themeId, change: h.eventCount })); const companyChanges = store.companyHistory.filter(h => h.attentionChange !== null).map(h => ({ id: h.companyId, change: h.events.length + h.researchMentions.length })); return { generatedAt, counts: { companies: count('COMPANY'), themes: count('THEME'), sectors: count('SECTOR'), events: count('EVENT'), institutions: count('INSTITUTION'), markets: count('MARKET'), research: count('RESEARCH'), relationships: store.edges.length }, newThisRun: uniq(ingestion.newRecordIds), updatedThisRun: uniq(ingestion.updatedRecordIds), reviewRequired: uniq(ingestion.reviewRequired), topChangedThemes: topWithTies(themeChanges, 3), topChangedCompanies: topWithTies(companyChanges, 3), evergreenCandidates: store.evergreenCandidates, warnings: [], conflicts: [], externalActions: { bloggerInsert: 0, bloggerPatch: 0, bloggerPublish: 0, driveUpload: 0, publicPdfShare: 0 }, commerce: { enabled: false } }; }
function required(store, type, id) { const r = store.records.find(x => x.recordType === type && x.canonicalId === id); if (!r)
    throw new Error(`${type} ${id} not found`); return r; }
function registryAliases(id) { for (const values of Object.values(REGISTRIES)) {
    const found = values.find(v => v.canonicalId === id);
    if (found)
        return found.aliases;
} return []; }
function titleFromId(id) { const found = Object.values(REGISTRIES).flat().find(v => v.canonicalId === id); return found?.displayName ?? id.replace(/^[^:]+:/, '').replace(/-/g, ' '); }
function maxDate(a, b) { return Date.parse(a) > Date.parse(b) ? a : b; }
function upsertBy(items, item, keyName) { const index = items.findIndex(x => x[keyName] === item[keyName]); if (index < 0)
    return [...items, item]; const next = [...items]; next[index] = item; return next; }
function mergeMetadata(base, next) { const merged = { ...base }; for (const [name, value] of Object.entries(next)) {
    const prior = merged[name];
    if (Array.isArray(prior) && Array.isArray(value)) {
        const values = [...prior, ...value];
        const seen = new Set();
        merged[name] = values.filter(item => { const id = JSON.stringify(item); if (seen.has(id))
            return false; seen.add(id); return true; });
    }
    else if (value !== null && value !== undefined)
        merged[name] = value;
} return merged; }
function targets(edges, fromId, type) { return uniq(edges.filter(e => e.relationshipType === type && e.fromId === fromId).map(e => e.toId)); }
function sources(edges, toId, type) { return uniq(edges.filter(e => e.relationshipType === type && e.toId === toId).map(e => e.fromId)); }
function relatedIds(store, publicationId, type) { return uniq(store.edges.filter(e => e.relationshipType === type && e.fromId === publicationId).map(e => e.toId)); }
function array(value) { return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : []; }
function nullable(value) { return typeof value === 'string' && value.length ? value : null; }
function state(current, prior) { if (prior === 0 && current > 0)
    return 'NEW'; if (current === 0 && prior > 0)
    return 'RESOLVED'; if (current > prior)
    return 'INCREASED'; if (current < prior)
    return 'DECREASED'; return 'UNCHANGED'; }
function getLinkedRecords(store, toId, type) { return store.edges.filter(e => e.relationshipType === type && e.toId === toId).map(e => store.records.find(r => r.canonicalId === e.fromId)).filter((r) => Boolean(r)); }
function topWithTies(items, limit) { const sorted = [...items].sort((a, b) => b.change - a.change || a.id.localeCompare(b.id)); if (sorted.length <= limit)
    return sorted; const boundary = sorted[limit - 1]?.change; return sorted.filter(x => x.change >= (boundary ?? Infinity)); }
