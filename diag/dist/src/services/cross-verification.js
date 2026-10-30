const factual = new Set(['MARKET_FACT', 'MACRO_FACT', 'CORPORATE_FACT', 'POLICY_FACT', 'GEOPOLITICAL_FACT']);
const analysis = new Set(['CAUSAL_INTERPRETATION', 'MARKET_REACTION', 'KOREA_IMPACT']);
const tierRank = ['A', 'B', 'C', 'D'];
const allowedReportStatuses = new Set(['VERIFIED', 'PARTIALLY_VERIFIED', 'PRIMARY_SOURCE_ONLY']);
export const claimAllowedInReport = (claim) => allowedReportStatuses.has(claim.verificationStatus) && claim.marketRelevance !== 'LOW' && claim.marketRelevance !== 'NONE';
export function verifyClaims(drafts, sources, verifiedAt) {
    const sourceMap = new Map(sources.map(source => [source.sourceId, source]));
    const claims = [];
    const conflicts = [];
    for (const draft of drafts) {
        const supporting = withTiers(draft.supportingSources, sourceMap);
        const contradicting = withTiers(draft.contradictingSources ?? [], sourceMap);
        const unresolved = withTiers(draft.unresolvedSources ?? [], sourceMap);
        const numericConflicts = detectSourceConflicts(draft, supporting, contradicting);
        conflicts.push(...numericConflicts);
        const geo = verifyGeoContext(draft.geopoliticalContext ?? null, sourceMap);
        const sourceDiversity = diversity([...supporting, ...contradicting, ...unresolved]);
        const informationType = draft.informationType ?? (analysis.has(draft.claimType) ? 'ANALYSIS' : 'FACT');
        const status = draft.rejected ? 'REJECTED' : statusFor(draft, supporting, contradicting, unresolved, numericConflicts, geo);
        const confidenceScore = scoreFor(status, supporting, contradicting, unresolved, sourceDiversity, geo);
        claims.push({ claimId: draft.claimId, reportId: draft.reportId, claimText: draft.claimText, claimType: draft.claimType, subject: draft.subject, predicate: draft.predicate, value: draft.value, unit: draft.unit ?? null, eventTime: draft.eventTime, verificationStatus: status, confidenceScore, evidenceIds: draft.evidenceIds, supportingSources: supporting, contradictingSources: contradicting, unresolvedSources: unresolved, sourceDiversity, geopoliticalContext: geo, informationType, marketRelevance: draft.marketRelevance ?? 'HIGH', manualReviewRequired: !allowedReportStatuses.has(status) || status === 'PARTIALLY_VERIFIED', createdAt: verifiedAt, verifiedAt });
    }
    return { claims, conflicts };
}
export function buildClaimsFromOutcome(input, candidates, reportId, createdAt, sources) {
    const drafts = [];
    for (const m of input.market.filter(record => record.close !== null))
        drafts.push({ claimId: `CLAIM-${m.id}-CLOSE`, reportId, claimText: `${m.symbol} 종가는 ${m.close} ${m.unit}이다.`, claimType: 'MARKET_FACT', subject: m.symbol, predicate: 'close', value: m.close, unit: m.unit, eventTime: m.observedAt, evidenceIds: [m.id], supportingSources: [sourceOf(m)], informationType: 'FACT', marketRelevance: 'HIGH' });
    for (const m of input.macro.filter(record => record.actual !== null))
        drafts.push({ claimId: `CLAIM-${m.id}-ACTUAL`, reportId, claimText: `${m.indicatorName} 실제값은 ${m.actual} ${m.unit}이다.`, claimType: 'MACRO_FACT', subject: m.indicatorId, predicate: 'actual', value: m.actual, unit: m.unit, eventTime: m.releaseTime, evidenceIds: [m.id], supportingSources: [sourceOf(m)], informationType: 'FACT', marketRelevance: 'HIGH' });
    for (const event of input.companyEvents)
        drafts.push({ claimId: `CLAIM-${event.id}-SUMMARY`, reportId, claimText: event.summary, claimType: 'CORPORATE_FACT', subject: event.ticker, predicate: event.eventType, value: null, unit: 'text', eventTime: event.eventTime, evidenceIds: [event.id], supportingSources: [sourceOf(event)], informationType: 'FACT', marketRelevance: 'HIGH' });
    for (const filing of input.filings)
        drafts.push({ claimId: `CLAIM-${filing.id}-FILING`, reportId, claimText: `${filing.ticker} ${filing.formType} accession ${filing.accessionNumber}.`, claimType: 'CORPORATE_FACT', subject: filing.ticker, predicate: 'filing', value: filing.accessionNumber, unit: 'text', eventTime: filing.filedAt, evidenceIds: [filing.id], supportingSources: [sourceOf(filing)], informationType: 'FACT', marketRelevance: 'HIGH' });
    for (const candidate of candidates)
        drafts.push({ claimId: `CLAIM-${candidate.id}`, reportId, claimText: candidate.rationale, claimType: 'KOREA_IMPACT', subject: candidate.koreaSector, predicate: candidate.transmissionPath, value: candidate.impactDirection, unit: null, eventTime: createdAt, evidenceIds: candidate.evidenceIds, supportingSources: candidate.evidenceIds.map((id) => evidenceSource(input, id)).filter((item) => item !== null), informationType: 'ANALYSIS', marketRelevance: 'HIGH' });
    return verifyClaims(drafts, sources, createdAt);
}
function sourceOf(record) { return { sourceId: record.sourceId, sourceUrl: record.sourceUrl, evidenceId: record.id, value: record.actual ?? record.close ?? record.summary ?? record.accessionNumber ?? null, observedAt: record.observedAt, collectedAt: record.collectedAt }; }
function evidenceSource(input, id) { for (const group of ['market', 'macro', 'companyEvents', 'filings']) {
    const record = input[group]?.find((item) => item.id === id);
    if (record)
        return sourceOf(record);
} return null; }
function withTiers(claimSources, sourceMap) {
    return claimSources.map(item => ({ ...item, tier: item.tier ?? sourceMap.get(item.sourceId)?.verificationTier ?? (sourceMap.get(item.sourceId)?.official ? 'A' : 'D') }));
}
function detectSourceConflicts(draft, supporting, contradicting) {
    const conflicts = [];
    if (contradicting.length)
        for (const source of contradicting)
            conflicts.push(conflict(draft, supporting[0] ?? source, source, 'CAUSAL_NARRATIVE', 'HIGH'));
    if (analysis.has(draft.claimType))
        return conflicts;
    for (let i = 0; i < supporting.length; i++)
        for (let j = i + 1; j < supporting.length; j++) {
            const a = supporting[i], b = supporting[j];
            if (a.value !== undefined && b.value !== undefined && a.value !== b.value)
                conflicts.push(conflict(draft, a, b, typeof a.value === 'number' && typeof b.value === 'number' ? 'NUMERIC_VALUE' : 'CAUSAL_NARRATIVE', materiality(a.value, b.value)));
        }
    return conflicts;
}
function conflict(draft, sourceA, sourceB, conflictType, materiality) {
    return { conflictId: `CONFLICT-${draft.claimId}-${sourceA.sourceId}-${sourceB.sourceId}`, claimId: draft.claimId, sourceA, sourceB, conflictType, valueA: sourceA.value ?? null, valueB: sourceB.value ?? null, materiality, resolutionStatus: 'OPEN', resolutionNote: '자동 해결 불가. 수동 검수 필요.' };
}
function materiality(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
        const diff = Math.abs(a - b);
        return diff >= 1 ? 'HIGH' : diff >= 0.05 ? 'MEDIUM' : 'LOW';
    }
    return a === b ? 'LOW' : 'HIGH';
}
function verifyGeoContext(context, sourceMap) {
    if (!context)
        return null;
    const withRole = (items, role) => withTiers(items.map(item => ({ ...item, role })), sourceMap);
    const partyA = withRole(context.partyASources, 'PARTY_A'), partyB = withRole(context.partyBSources, 'PARTY_B'), neutral = withRole(context.neutralSources, 'NEUTRAL'), official = withRole(context.officialSources, 'OFFICIAL');
    const conflictStatus = context.conflictStatus === 'CONFLICT' ? 'CONFLICT' : partyA.length && partyB.length && neutral.length ? 'VERIFIED' : partyA.length + partyB.length + neutral.length >= 2 ? 'PARTIALLY_VERIFIED' : 'REVIEW_REQUIRED';
    return { ...context, partyASources: partyA, partyBSources: partyB, neutralSources: neutral, officialSources: official, conflictStatus };
}
function diversity(items) {
    const tiers = [...new Set(items.map(item => item.tier).filter((tier) => Boolean(tier)))].sort((a, b) => tierRank.indexOf(a) - tierRank.indexOf(b));
    const sourceCount = new Set(items.map(item => item.sourceId)).size;
    return { tierCount: tiers.length, sourceCount, independentSourceCount: sourceCount, tiers };
}
function statusFor(draft, supporting, contradicting, unresolved, conflicts, geo) {
    if (conflicts.length || contradicting.length)
        return 'CONFLICT';
    if (geo)
        return geo.conflictStatus;
    if (!supporting.length)
        return unresolved.length ? 'UNVERIFIED' : 'INSUFFICIENT_SOURCES';
    const hasTierA = supporting.some(source => source.tier === 'A');
    const sourceCount = new Set(supporting.map(source => source.sourceId)).size;
    if (analysis.has(draft.claimType))
        return sourceCount >= 2 && hasTierA ? 'VERIFIED' : sourceCount >= 2 ? 'PARTIALLY_VERIFIED' : 'INSUFFICIENT_SOURCES';
    if (factual.has(draft.claimType) && hasTierA && sourceCount >= 1)
        return 'VERIFIED';
    if (sourceCount >= 2)
        return 'VERIFIED';
    return 'INSUFFICIENT_SOURCES';
}
function scoreFor(status, supporting, contradicting, unresolved, sourceDiversity, geo) {
    const base = status === 'VERIFIED' ? 80 : status === 'PRIMARY_SOURCE_ONLY' ? 75 : status === 'PARTIALLY_VERIFIED' ? 60 : status === 'INSUFFICIENT_SOURCES' ? 40 : status === 'UNVERIFIED' ? 25 : status === 'CONFLICT' ? 15 : status === 'REJECTED' ? 0 : 50;
    const tierBonus = supporting.some(source => source.tier === 'A') ? 10 : 0;
    const diversityBonus = Math.min(10, Math.max(0, sourceDiversity.independentSourceCount - 1) * 5);
    const geoBonus = geo?.conflictStatus === 'VERIFIED' ? 5 : 0;
    const penalties = contradicting.length * 25 + unresolved.length * 10;
    return Math.max(0, Math.min(100, base + tierBonus + diversityBonus + geoBonus - penalties));
}
