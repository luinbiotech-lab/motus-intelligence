import { createHash } from 'node:crypto';
export const crossNodeKinds = ['AI_INTELLIGENCE', 'WALL_STREET_INTELLIGENCE', 'KOREA_RESEARCH', 'KOREA_MARKET_FACT'];
export const crossLinkReasons = ['EVENT_ID', 'THEME_ID', 'COMPANY_ID', 'SECTOR_ID', 'EVIDENCE_SOURCE'];
const verifiedStatuses = ['VERIFIED', 'PARTIALLY_VERIFIED', 'PRIMARY_SOURCE_ONLY'];
const statusPriority = ['REJECTED', 'CONFLICT', 'UNVERIFIED', 'INSUFFICIENT_SOURCES', 'REVIEW_REQUIRED', 'PARTIALLY_VERIFIED', 'PRIMARY_SOURCE_ONLY', 'VERIFIED'];
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const unique = (values) => [...new Set(values)];
const intersection = (left, right) => unique(left.filter(value => right.includes(value)));
const safeTime = (value) => { const time = Date.parse(value); return Number.isFinite(time) ? time : null; };
export function buildCrossIntelligenceChains(input, options) {
    requireTime(options.createdAt, 'createdAt');
    if (options.updatedAt !== undefined)
        requireTime(options.updatedAt, 'updatedAt');
    const nodes = [
        ...input.aiIntelligence.filter(usableResearch).map(item => normalizeIntelligence(item, 'AI_INTELLIGENCE')),
        ...input.wallStreetIntelligence.filter(usableResearch).map(item => normalizeIntelligence(item, 'WALL_STREET_INTELLIGENCE')),
        ...input.koreaResearch.filter(usableBrokerage).map(normalizeBrokerage),
        ...input.koreaMarketFacts.filter(usableMarketFact).map(normalizeMarketFact)
    ];
    const parent = nodes.map((_, index) => index);
    const groupEvents = nodes.map(node => new Set(node.eventIds));
    const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
    const candidates = [];
    for (let left = 0; left < nodes.length; left++)
        for (let right = left + 1; right < nodes.length; right++) {
            const edge = linkCandidate(nodes[left], nodes[right], options.timeWindowHours ?? 72);
            if (edge)
                candidates.push(edge);
        }
    candidates.sort((a, b) => a.priority - b.priority || a.edgeId.localeCompare(b.edgeId));
    const accepted = [];
    for (const edge of candidates) {
        const leftIndex = nodes.findIndex(node => sameRef(node.ref, edge.from));
        const rightIndex = nodes.findIndex(node => sameRef(node.ref, edge.to));
        let leftRoot = find(leftIndex), rightRoot = find(rightIndex);
        if (leftRoot === rightRoot) {
            accepted.push(edge);
            continue;
        }
        const leftEvents = groupEvents[leftRoot], rightEvents = groupEvents[rightRoot];
        if (edge.reason !== 'EVENT_ID' && leftEvents.size && rightEvents.size && intersection([...leftEvents], [...rightEvents]).length === 0)
            continue;
        parent[rightRoot] = leftRoot;
        for (const eventId of rightEvents)
            leftEvents.add(eventId);
        groupEvents[rightRoot] = leftEvents;
        accepted.push(edge);
    }
    const groups = new Map();
    nodes.forEach((node, index) => { const root = find(index); groups.set(root, [...(groups.get(root) ?? []), node]); });
    return [...groups.values()].map(group => createChain(group, accepted.filter(edge => group.some(node => sameRef(node.ref, edge.from)) && group.some(node => sameRef(node.ref, edge.to))), input.history ?? [], options)).sort((a, b) => a.crossIntelligenceId.localeCompare(b.crossIntelligenceId));
}
function linkCandidate(left, right, timeWindowHours) {
    const checks = [
        { reason: 'EVENT_ID', matches: intersection(left.eventIds, right.eventIds), priority: 1 },
        { reason: 'THEME_ID', matches: intersection(left.themeIds, right.themeIds), priority: 2 },
        { reason: 'COMPANY_ID', matches: intersection(left.companies, right.companies), priority: 3 },
        { reason: 'SECTOR_ID', matches: intersection(left.sectors, right.sectors), priority: 4 },
        { reason: 'EVIDENCE_SOURCE', matches: unique([...intersection(left.evidenceIds, right.evidenceIds), ...intersection(left.sourceIds, right.sourceIds)]), priority: 6 }
    ];
    const chosen = checks.find(check => check.matches.length);
    if (!chosen)
        return null;
    if (chosen.reason !== 'EVENT_ID' && left.eventIds.length && right.eventIds.length && intersection(left.eventIds, right.eventIds).length === 0)
        return null;
    const distance = timeDistanceHours(left.observedAt, right.observedAt);
    return {
        edgeId: `edge:${hash([left.ref.kind, left.ref.id, right.ref.kind, right.ref.id, chosen.reason, ...chosen.matches].join('|'))}`,
        from: left.ref, to: right.ref, reason: chosen.reason, matchedIds: chosen.matches,
        evidenceIds: intersection(left.evidenceIds, right.evidenceIds), sourceIds: intersection(left.sourceIds, right.sourceIds),
        timeDistanceHours: distance !== null && distance <= timeWindowHours ? distance : null, priority: chosen.priority
    };
}
function createChain(nodes, edges, history, options) {
    const eventIds = unique(nodes.flatMap(node => node.eventIds)).sort();
    const themeIds = unique(nodes.flatMap(node => node.themeIds)).sort();
    const fallbackSeed = themeIds[0] ?? nodes.flatMap(node => node.companies)[0] ?? nodes.flatMap(node => node.sectors)[0] ?? nodes[0].ref.id;
    const eventId = (eventIds[0] ?? `event:cross-${hash(fallbackSeed).slice(0, 16)}`);
    const chainId = `cross:${hash(nodes.map(node => `${node.ref.kind}:${node.ref.id}`).sort().join('|'))}`;
    const signals = nodes.flatMap(node => node.signals);
    const sharedSignals = buildSharedSignals(signals);
    const divergentSignals = buildDivergentSignals(signals);
    const changedSignals = buildChangedSignals(signals, history, nodes);
    const confidenceValues = nodes.map(node => node.confidence).filter((value) => value !== null);
    const verificationStatus = nodes.map(node => node.verificationStatus).sort((a, b) => statusPriority.indexOf(a) - statusPriority.indexOf(b))[0] ?? 'UNVERIFIED';
    const reasons = unique(edges.map(edge => edge.reason));
    return {
        crossIntelligenceId: chainId, eventId, relatedEventIds: eventIds.filter(value => value !== eventId), primaryThemeId: themeIds[0] ?? null, relatedThemeIds: themeIds.slice(1),
        aiIntelligenceIds: ids(nodes, 'AI_INTELLIGENCE'), wallStreetIntelligenceIds: ids(nodes, 'WALL_STREET_INTELLIGENCE'), koreaResearchIds: ids(nodes, 'KOREA_RESEARCH'), koreaMarketFactIds: ids(nodes, 'KOREA_MARKET_FACT'),
        companies: unique(nodes.flatMap(node => node.companies)).sort(), sectors: unique(nodes.flatMap(node => node.sectors)).sort(), markets: unique(nodes.flatMap(node => node.markets)).sort(),
        stageSummaries: {
            aiIndustry: headlines(nodes, 'AI_INTELLIGENCE'), wallStreet: headlines(nodes, 'WALL_STREET_INTELLIGENCE'),
            koreaResearch: headlines(nodes, 'KOREA_RESEARCH'), koreaMarketReaction: headlines(nodes, 'KOREA_MARKET_FACT')
        },
        sharedSignals, divergentSignals, changedSignals,
        connectionSummary: `${nodes.length}개 검증 항목을 ${reasons.length ? reasons.map(reason => reasonLabel(reason)).join('·') : '단일 관측'} 근거로 연결`,
        aiSummary: structuredClone(options.aiSummariesByEventId?.[eventId] ?? null),
        evidenceIds: unique(nodes.flatMap(node => node.evidenceIds)).sort(), sourceIds: unique(nodes.flatMap(node => node.sourceIds)).sort(), sourceLinks: dedupeLinks(nodes.flatMap(node => node.sourceLinks)),
        verificationStatus, confidence: confidenceValues.length ? Math.min(...confidenceValues) : null, createdAt: options.createdAt, updatedAt: options.updatedAt ?? options.createdAt,
        edgeProvenance: edges.map(({ priority: _, ...edge }) => edge)
    };
}
function normalizeIntelligence(item, kind) {
    const sourceIds = item.provenance.sources.map(source => source.sourceId);
    const evidenceIds = unique([...item.evidenceIds, ...item.provenance.sources.map(source => source.evidenceId)]);
    const label = item.institutionView ?? item.aiInterpretation ?? item.summary;
    const signal = stanceDirection(item.stance);
    return {
        ref: { kind, id: item.intelligenceId }, headline: item.headline, observedAt: item.publishedAt ?? item.collectedAt, eventIds: item.eventId ? [item.eventId] : [],
        themeIds: unique([...(item.themeId ? [item.themeId] : []), ...(item.relatedThemeIds ?? [])]), companies: unique([...(item.companyId ? [item.companyId] : []), ...item.relatedCompanies]),
        sectors: unique([...(item.sector ? [sectorId(item.sector)] : []), ...item.relatedSectors.map(sectorId)]), markets: unique([...(item.market ? [item.market] : []), ...item.relatedMarkets]),
        evidenceIds, sourceIds, sourceLinks: dedupeLinks(item.provenance.sources.map(source => ({ label: item.publisher ?? item.source, url: source.sourceUrl, publisher: item.publisher }))),
        verificationStatus: item.verificationStatus, confidence: item.confidence,
        signals: signal === 'UNKNOWN' ? [] : [{ signalKey: signalKey(item.themeId, item.companyId, item.sector), node: { kind, id: item.intelligenceId }, label, direction: signal, evidenceIds, sourceIds }]
    };
}
function normalizeBrokerage(item) {
    const evidenceIds = item.evidence.map(value => value.evidenceId);
    const sourceIds = item.provenance.map(value => value.sourceRecordId);
    const direction = brokerageDirection(item);
    return {
        ref: { kind: 'KOREA_RESEARCH', id: item.researchId }, headline: item.headline, observedAt: item.publishedAt, eventIds: item.eventId ? [item.eventId] : [], themeIds: item.themeId ? [item.themeId] : [], companies: item.companyId ? [item.companyId] : [],
        sectors: item.sector ? [sectorId(item.sector)] : [], markets: item.market ? [item.market] : [], evidenceIds, sourceIds,
        sourceLinks: dedupeLinks(item.provenance.map(source => ({ label: `${item.publisher} ${source.sourceFormat} 원문`, url: source.sourceUrl, publisher: item.publisher }))),
        verificationStatus: item.verificationStatus, confidence: null,
        signals: direction === 'UNKNOWN' ? [] : [{ signalKey: signalKey(item.themeId, item.companyId, item.sector), node: { kind: 'KOREA_RESEARCH', id: item.researchId }, label: item.institutionView, direction, evidenceIds, sourceIds }]
    };
}
function normalizeMarketFact(fact) {
    const sourceIds = [fact.provenance.sourceRecordId];
    const direction = marketDirection(fact);
    const key = marketSignalKey(fact);
    return {
        ref: { kind: 'KOREA_MARKET_FACT', id: fact.factId }, headline: marketFactLabel(fact), observedAt: fact.observedAt, eventIds: [...fact.relationships.eventIds], themeIds: [...fact.relationships.themeIds],
        companies: unique([...(fact.companyId ? [fact.companyId] : []), ...fact.relationships.companyIds]), sectors: unique([...(fact.sectorId ? [fact.sectorId] : []), ...fact.relationships.sectorIds]), markets: [fact.marketId],
        evidenceIds: [], sourceIds, sourceLinks: [{ label: fact.source, url: fact.sourceUrl, publisher: fact.source }], verificationStatus: fact.verificationStatus, confidence: null,
        signals: direction === 'UNKNOWN' || !key ? [] : [{ signalKey: key, node: { kind: 'KOREA_MARKET_FACT', id: fact.factId }, label: marketFactLabel(fact), direction, evidenceIds: [], sourceIds }]
    };
}
function buildSharedSignals(signals) {
    const groups = groupSignals(signals);
    const output = [];
    for (const [signalKey, items] of groups) {
        const directions = unique(items.map(item => item.direction));
        if (items.length >= 2 && directions.length === 1)
            output.push({ signalKey, label: items[0].label, direction: directions[0], contributors: stripSignalKey(items) });
    }
    return output;
}
function buildDivergentSignals(signals) {
    const groups = groupSignals(signals);
    const output = [];
    for (const [signalKey, items] of groups) {
        const directions = unique(items.map(item => item.direction));
        if (directions.length >= 2)
            output.push({ signalKey, label: items[0].label, directions, contributors: stripSignalKey(items) });
    }
    return output;
}
function buildChangedSignals(signals, history, nodes) {
    const output = [];
    for (const signal of signals) {
        const previous = history.filter(item => sameRef(item.node, signal.node) && item.signalKey === signal.signalKey).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
        if (!previous || previous.direction === signal.direction)
            continue;
        const currentObservedAt = nodes.find(node => sameRef(node.ref, signal.node)).observedAt;
        output.push({ signalKey: signal.signalKey, label: signal.label, node: signal.node, previous: previous.direction, current: signal.direction, previousObservedAt: previous.observedAt, currentObservedAt });
    }
    return output;
}
export function buildCrossIntelligenceNewsletterEntries(chains) {
    return chains.filter(chain => verifiedStatuses.includes(chain.verificationStatus)).map(chain => ({
        themeEvent: displayThemeEvent(chain), connectionSummary: chain.connectionSummary,
        aiIndustry: [...chain.stageSummaries.aiIndustry], wallStreet: [...chain.stageSummaries.wallStreet],
        koreaResearch: [...chain.stageSummaries.koreaResearch], koreaMarketReaction: [...chain.stageSummaries.koreaMarketReaction],
        sharedSignals: chain.sharedSignals.map(signal => `${signal.label} · ${signal.direction}`),
        divergentSignals: chain.divergentSignals.map(signal => `${signal.label} · ${signal.directions.join(' / ')}`),
        changedSignals: chain.changedSignals.map(signal => `${signal.label} · ${signal.previous} → ${signal.current}`),
        aiSummary: structuredClone(chain.aiSummary), sources: structuredClone(chain.sourceLinks)
    }));
}
function displayThemeEvent(chain) {
    const theme = chain.primaryThemeId?.replace(/^theme:/, '').replaceAll('-', ' ');
    return theme ? `Theme · ${theme}` : 'Cross Intelligence Event';
}
function usableResearch(item) { return verifiedStatuses.includes(item.verificationStatus); }
function usableBrokerage(item) { return verifiedStatuses.includes(item.verificationStatus); }
function usableMarketFact(item) { return verifiedStatuses.includes(item.verificationStatus); }
function stanceDirection(value) { return value === 'BULLISH' ? 'POSITIVE' : value === 'BEARISH' ? 'NEGATIVE' : value === 'NEUTRAL' ? 'NEUTRAL' : value === 'MIXED' ? 'MIXED' : 'UNKNOWN'; }
function brokerageDirection(item) {
    if (item.ratingChange === 'UPGRADE' || item.targetPriceChange === 'UP')
        return 'POSITIVE';
    if (item.ratingChange === 'DOWNGRADE' || item.targetPriceChange === 'DOWN')
        return 'NEGATIVE';
    if (item.ratingChange === 'UNCHANGED' || item.targetPriceChange === 'UNCHANGED')
        return 'NEUTRAL';
    return 'UNKNOWN';
}
function marketDirection(fact) {
    if (!['INVESTOR_NET_FLOW', 'PROGRAM_NET_FLOW', 'SECTOR_CHANGE_PCT', 'SECURITY_CHANGE_PCT'].includes(fact.factType))
        return 'UNKNOWN';
    return fact.value > 0 ? 'POSITIVE' : fact.value < 0 ? 'NEGATIVE' : 'NEUTRAL';
}
function marketSignalKey(fact) {
    if (fact.factType === 'INVESTOR_NET_FLOW')
        return `FLOW:${fact.marketId}:${fact.investorType}`;
    if (fact.factType === 'PROGRAM_NET_FLOW')
        return `PROGRAM:${fact.marketId}`;
    if (fact.factType === 'SECTOR_CHANGE_PCT')
        return `SECTOR:${fact.sectorId}`;
    if (fact.factType === 'SECURITY_CHANGE_PCT')
        return `COMPANY:${fact.companyId ?? fact.ticker}`;
    return null;
}
function marketFactLabel(fact) {
    if (fact.factType === 'INVESTOR_NET_FLOW')
        return `${fact.marketId} ${fact.investorType} 수급`;
    if (fact.factType === 'SECTOR_CHANGE_PCT')
        return `${fact.sectorLabel} 업종 반응`;
    if (fact.factType === 'SECURITY_CHANGE_PCT')
        return `${fact.company} 시장 반응`;
    return `${fact.marketId} ${fact.factType}`;
}
function signalKey(themeId, companyId, sector) { return themeId ? `THEME:${themeId}` : companyId ? `COMPANY:${companyId}` : sector ? `SECTOR:${sectorId(sector)}` : 'GENERAL'; }
function sectorId(value) { if (value.startsWith('sector:'))
    return value.toLowerCase(); const aliases = { 반도체: 'semiconductors', '정보기술': 'information-technology', '전기·전자': 'electronics', '전기전자': 'electronics', 자동차: 'automobiles', 금융: 'financials', 바이오: 'biotechnology' }; const normalized = aliases[value.trim()] ?? value.normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''); return `sector:${normalized}`; }
function groupSignals(signals) { const groups = new Map(); for (const signal of signals)
    groups.set(signal.signalKey, [...(groups.get(signal.signalKey) ?? []), signal]); return groups; }
function stripSignalKey(items) { return items.map(({ signalKey: _, ...item }) => item); }
function ids(nodes, kind) { return nodes.filter(node => node.ref.kind === kind).map(node => node.ref.id).sort(); }
function headlines(nodes, kind) { return nodes.filter(node => node.ref.kind === kind).map(node => node.headline); }
function reasonLabel(reason) { return { EVENT_ID: '공통 이벤트', THEME_ID: '공통 테마', COMPANY_ID: '공통 기업', SECTOR_ID: '공통 업종', EVIDENCE_SOURCE: '공통 근거' }[reason]; }
function timeDistanceHours(left, right) { const a = safeTime(left), b = safeTime(right); return a === null || b === null ? null : Math.round(Math.abs(a - b) / 36_000) / 100; }
function sameRef(left, right) { return left.kind === right.kind && left.id === right.id; }
function hash(value) { return createHash('sha256').update(value).digest('hex').slice(0, 24); }
function requireTime(value, path) { if (!nonEmpty(value) || !Number.isFinite(Date.parse(value)))
    throw new Error(`${path}: ISO timestamp required`); }
function dedupeLinks(values) { const seen = new Set(); return values.filter(value => { const key = value.url; if (seen.has(key))
    return false; seen.add(key); return true; }); }
