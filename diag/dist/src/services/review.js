const rank = {
    CONFLICT: 10,
    UNVERIFIED: 8,
    REVIEW_REQUIRED: 7,
    PARTIALLY_VERIFIED: 6,
    INSUFFICIENT_SOURCES: 5,
    PRIMARY_SOURCE_ONLY: 2,
    VERIFIED: 1,
    REJECTED: 9
};
export function buildReviewQueue(claims, conflicts) {
    const conflictMap = new Map();
    for (const conflict of conflicts)
        conflictMap.set(conflict.claimId, [...(conflictMap.get(conflict.claimId) ?? []), conflict]);
    return claims
        .map(claim => {
        const claimConflicts = conflictMap.get(claim.claimId) ?? [];
        const highConflict = claimConflicts.some(item => item.materiality === 'CRITICAL' || item.materiality === 'HIGH');
        const priority = highConflict ? 10 : rank[claim.verificationStatus];
        return { itemId: `REVIEW-${claim.claimId}`, claimId: claim.claimId, priority, reason: reasonFor(claim, claimConflicts), verificationStatus: claim.verificationStatus, conflictIds: claimConflicts.map(item => item.conflictId) };
    })
        .filter(item => item.priority > 1)
        .sort((a, b) => b.priority - a.priority || a.claimId.localeCompare(b.claimId));
}
export function initialApprovalStatus(hasBlockingValidation, claims, conflicts) {
    if (hasBlockingValidation)
        return 'BLOCKED';
    if (conflicts.some(item => item.materiality === 'HIGH' || item.materiality === 'CRITICAL'))
        return 'REVIEW_REQUIRED';
    if (claims.some(claim => claim.manualReviewRequired && claim.verificationStatus !== 'PARTIALLY_VERIFIED'))
        return 'REVIEW_REQUIRED';
    return 'AUTO_VALIDATED';
}
export function transitionApprovalStatus(current, action) {
    if (action === 'block')
        return 'BLOCKED';
    if (action === 'approve')
        return current === 'AUTO_VALIDATED' || current === 'REVIEW_REQUIRED' || current === 'DRAFT' ? 'APPROVED' : current;
    if (action === 'publish')
        return current === 'APPROVED' ? 'PUBLISHED' : 'BLOCKED';
    return current;
}
const queueReasonRank = {
    'CRITICAL conflict': 100,
    'HIGH conflict': 90,
    UNVERIFIED: 80,
    PARTIALLY_VERIFIED: 70,
    LOW_CONFIDENCE: 60,
    KOREA_IMPACT: 50
};
const emptyCounts = () => ({
    VERIFIED: 0,
    PARTIALLY_VERIFIED: 0,
    CONFLICT: 0,
    UNVERIFIED: 0,
    INSUFFICIENT_SOURCES: 0,
    PRIMARY_SOURCE_ONLY: 0,
    REVIEW_REQUIRED: 0,
    REJECTED: 0,
    REVIEW_REQUIRED_QUEUE: 0
});
export function buildReviewSheet(evidence) {
    const claims = evidence.claims ?? [];
    const conflicts = evidence.conflicts ?? [];
    const conflictMap = new Map(conflicts.map(conflict => [conflict.claimId, conflict]));
    const queue = evidence.reviewQueue?.length ? evidence.reviewQueue : buildReviewQueue(claims, conflicts);
    const queueMap = new Map(queue.map(item => [item.claimId, item]));
    const counts = emptyCounts();
    for (const claim of claims)
        counts[claim.verificationStatus] += 1;
    counts.REVIEW_REQUIRED_QUEUE = queue.length;
    const sortedClaims = [...claims].sort((a, b) => {
        const aq = queueMap.get(a.claimId);
        const bq = queueMap.get(b.claimId);
        const ap = reviewSheetPriority(a, conflictMap.get(a.claimId), aq?.reason);
        const bp = reviewSheetPriority(b, conflictMap.get(b.claimId), bq?.reason);
        return bp - ap || a.claimId.localeCompare(b.claimId);
    });
    const items = sortedClaims.map(claim => reviewSheetItem(claim, conflictMap.get(claim.claimId) ?? null, queueMap.get(claim.claimId)));
    return {
        reportId: evidence.reportId,
        tradingDate: evidence.reportMetadata.tradingDate,
        generatedAt: evidence.reportMetadata.generatedAt,
        approvalStatus: evidence.approvalStatus ?? 'DRAFT',
        blocked: (evidence.approvalStatus ?? 'DRAFT') === 'BLOCKED' || evidence.publishStatus === 'BLOCKED',
        counts,
        items,
        verifiedSummary: { count: counts.VERIFIED, sampleClaimIds: claims.filter(claim => claim.verificationStatus === 'VERIFIED').slice(0, 10).map(claim => claim.claimId) }
    };
}
function reviewSheetItem(claim, conflict, queueItem) {
    return {
        claimId: claim.claimId,
        claimText: claim.claimText,
        claimType: claim.claimType,
        verificationStatus: claim.verificationStatus,
        confidenceScore: claim.confidenceScore,
        informationType: claim.informationType,
        supportingSources: claim.supportingSources,
        contradictingSources: claim.contradictingSources,
        evidenceIds: claim.evidenceIds,
        sourceTier: highestTier(claim),
        conflict,
        counterFactors: claim.geopoliticalContext?.unresolvedClaims ?? [],
        recommendedAction: recommendedAction(claim, conflict),
        priority: reviewSheetPriority(claim, conflict, queueItem?.reason),
        reason: queueItem?.reason ?? reasonFor(claim, conflict ? [conflict] : [])
    };
}
function reviewSheetPriority(claim, conflict, reason) {
    if (conflict?.materiality === 'CRITICAL')
        return 100;
    if (conflict?.materiality === 'HIGH')
        return 90;
    if (claim.verificationStatus === 'UNVERIFIED')
        return 80;
    if (claim.verificationStatus === 'PARTIALLY_VERIFIED')
        return 70;
    if (claim.confidenceScore < 70)
        return 60;
    if (claim.claimType === 'KOREA_IMPACT')
        return 50;
    if (reason && queueReasonRank[reason])
        return queueReasonRank[reason];
    return claim.verificationStatus === 'VERIFIED' ? 10 : 40;
}
function highestTier(claim) {
    const tiers = claim.sourceDiversity.tiers;
    return tiers.includes('A') ? 'A' : tiers.includes('B') ? 'B' : tiers.includes('C') ? 'C' : tiers.includes('D') ? 'D' : 'UNVERIFIED';
}
function recommendedAction(claim, conflict) {
    if (conflict?.materiality === 'CRITICAL' || conflict?.materiality === 'HIGH')
        return 'CHECK_SOURCE';
    if (claim.verificationStatus === 'CONFLICT')
        return 'MODIFY_WORDING';
    if (claim.verificationStatus === 'UNVERIFIED' || claim.verificationStatus === 'INSUFFICIENT_SOURCES')
        return 'HOLD';
    if (claim.confidenceScore < 70)
        return 'DOWNGRADE_CONFIDENCE';
    if (claim.verificationStatus === 'REJECTED')
        return 'REJECT';
    return 'APPROVE';
}
export function createReviewAction(evidence, input, now = input.reviewedAt ?? new Date().toISOString()) {
    if (input.reportId !== evidence.reportId)
        throw new Error(`reportId mismatch: ${input.reportId}`);
    const claim = (evidence.claims ?? []).find(item => item.claimId === input.claimId);
    if (!claim)
        throw new Error(`invalid claimId: ${input.claimId}`);
    if (input.action === 'MODIFY' && !input.modifiedText?.trim())
        throw new Error('MODIFY requires modifiedText');
    if (input.action === 'APPROVE' && claim.verificationStatus !== 'VERIFIED' && !input.note.trim())
        throw new Error('unresolved claim approval requires note');
    const finalDecision = finalDecisionFor(input.action, input.modifiedText);
    const hash = Math.abs([...`${input.reportId}|${input.claimId}|${input.action}|${now}|${input.reviewer}`].reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) | 0, 0)).toString(16);
    return {
        reviewActionId: `RA-${hash}`,
        reportId: input.reportId,
        claimId: input.claimId,
        action: input.action,
        originalText: claim.claimText,
        modifiedText: input.action === 'MODIFY' ? input.modifiedText.trim() : null,
        category: input.category,
        note: input.note,
        reviewer: input.reviewer,
        reviewedAt: now,
        originalVerificationStatus: claim.verificationStatus,
        finalDecision,
        ...(claim.verificationStatus !== 'VERIFIED' && input.action === 'APPROVE' ? { overrideReason: input.note } : {})
    };
}
function finalDecisionFor(action, modifiedText) {
    if (action === 'APPROVE')
        return 'APPROVED_AS_WRITTEN';
    if (action === 'MODIFY')
        return `APPROVED_WITH_MODIFICATION: ${modifiedText}`;
    if (action === 'REJECT')
        return 'REJECTED_BY_REVIEWER';
    return 'HELD_FOR_FOLLOW_UP';
}
export function applyReviewActions(evidence, actions) {
    for (const action of actions) {
        if (action.reportId !== evidence.reportId)
            throw new Error(`reportId mismatch: ${action.reportId}`);
        if (!(evidence.claims ?? []).some(claim => claim.claimId === action.claimId))
            throw new Error(`invalid claimId: ${action.claimId}`);
    }
    const first = actions.map(action => action.reviewedAt).sort()[0] ?? null;
    const last = actions.map(action => action.reviewedAt).sort().at(-1) ?? null;
    const metrics = reviewMetricsFromActions(evidence.reviewMetrics, actions, first, last);
    const approvalStatus = actions.length ? evaluateApprovalGate(evidence, actions) : evidence.approvalStatus ?? 'DRAFT';
    return { ...evidence, reviewMetrics: metrics, approvalStatus };
}
function reviewMetricsFromActions(current, actions, first, last) {
    const approved = actions.filter(action => action.action === 'APPROVE').length;
    const modified = actions.filter(action => action.action === 'MODIFY').length;
    const rejected = actions.filter(action => action.action === 'REJECT').length;
    const held = actions.filter(action => action.action === 'HOLD').length;
    const duration = first && last ? Math.max(0, Math.round((Date.parse(last) - Date.parse(first)) / 1000)) : null;
    const edits = { ...current.edits };
    for (const action of actions) {
        const legacy = legacyCategory(action.category);
        edits[legacy] = [...(edits[legacy] ?? []), `${action.claimId}: ${action.note}`];
    }
    return {
        ...current,
        humanReviewStartedAt: first,
        humanReviewCompletedAt: last,
        durationMinutes: duration === null ? null : duration / 60,
        measurementStatus: first && last ? 'MEASURED' : 'NOT_MEASURED',
        edits,
        reviewStartedAt: first,
        reviewCompletedAt: last,
        reviewDurationSeconds: duration,
        claimsReviewed: actions.length,
        claimsApproved: approved,
        claimsModified: modified,
        claimsRejected: rejected,
        claimsHeld: held,
        conflictsResolved: actions.filter(action => action.action === 'MODIFY' || action.action === 'REJECT').length,
        manualEdits: actions.map(action => `${action.claimId}:${action.action}:${action.category}`),
        reviewer: actions.at(-1)?.reviewer ?? current.reviewer ?? null
    };
}
function legacyCategory(category) {
    if (category === 'DATA_ERROR')
        return 'NUMERIC_ERROR';
    if (category === 'CAUSAL_INTERPRETATION')
        return 'CAUSE_INTERPRETATION';
    if (category === 'KOREA_IMPACT')
        return 'KOREA_LINK';
    if (category === 'DUPLICATE')
        return 'OTHER';
    return category;
}
export function evaluateApprovalGate(evidence, actions) {
    const actionByClaim = new Map(actions.map(action => [action.claimId, action]));
    const unresolvedConflict = (materiality) => (evidence.conflicts ?? []).some(conflict => conflict.materiality === materiality && !actionByClaim.has(conflict.claimId));
    if (unresolvedConflict('CRITICAL') || unresolvedConflict('HIGH'))
        return 'REVIEW_REQUIRED';
    const importantUnverified = (evidence.claims ?? []).some(claim => ['UNVERIFIED', 'INSUFFICIENT_SOURCES', 'REVIEW_REQUIRED'].includes(claim.verificationStatus) && claim.marketRelevance === 'HIGH' && !actionByClaim.has(claim.claimId));
    if (importantUnverified)
        return 'REVIEW_REQUIRED';
    const neededQueue = (evidence.reviewQueue ?? []).some(item => !actionByClaim.has(item.claimId));
    if (neededQueue)
        return 'REVIEW_REQUIRED';
    if (actions.some(action => action.action === 'HOLD'))
        return 'REVIEW_REQUIRED';
    return 'APPROVED';
}
export function buildPublishReadyDraft(report, evidence, actions) {
    const actionByClaim = new Map(actions.map(action => [action.claimId, action]));
    const sections = report.sections.map(section => ({
        ...section,
        items: section.items.flatMap(item => {
            const relatedActions = (item.claimIds ?? []).map(id => actionByClaim.get(id)).filter((action) => Boolean(action));
            if (relatedActions.some(action => action.action === 'REJECT'))
                return [];
            const modifier = relatedActions.find(action => action.action === 'MODIFY');
            return [{ ...item, text: modifier?.modifiedText ?? item.text }];
        })
    }));
    const traceability = sections.flatMap(section => section.items.map(item => {
        const records = evidence.records.filter(record => item.evidenceIds.includes(record.evidenceId));
        return { sentence: item.text, claimIds: item.claimIds ?? [], evidenceIds: item.evidenceIds, sourceIds: records.map(record => record.sourceId), sourceUrls: records.map(record => record.sourceUrl) };
    }));
    const finalReport = { ...report, sections };
    return {
        reportId: report.reportId,
        tradingDate: report.tradingDate,
        generatedAt: new Date().toISOString(),
        approvalStatus: evidence.approvalStatus ?? 'DRAFT',
        publishAllowed: (evidence.approvalStatus ?? 'DRAFT') === 'APPROVED',
        sections,
        markdown: renderMarkdown(finalReport),
        traceability
    };
}
export function buildMachineHumanDiff(report, draft, actions) {
    const originalText = flattenReport(report.sections);
    const finalText = flattenReport(draft.sections);
    const changedClaims = actions.filter(action => action.action !== 'APPROVE').map(action => action.claimId);
    const originalLines = new Set(originalText.split('\n').filter(Boolean));
    const finalLines = new Set(finalText.split('\n').filter(Boolean));
    return {
        reportId: report.reportId,
        originalText,
        finalText,
        changedClaims,
        addedText: [...finalLines].filter(line => !originalLines.has(line)),
        removedText: [...originalLines].filter(line => !finalLines.has(line)),
        editCategories: [...new Set(actions.map(action => action.category))],
        editCount: actions.filter(action => action.action !== 'APPROVE').length
    };
}
function flattenReport(sections) {
    return sections.map(section => `## ${section.title}\n${section.items.map(item => item.text).join('\n')}`).join('\n\n');
}
function renderMarkdown(report) {
    return `> publish-ready draft · 자동 게시 아님\n\n> reportId: ${report.reportId}\n\n` + report.sections.map(section => `## ${section.title}\n\n${section.items.map(item => `- ${item.text}`).join('\n')}`).join('\n\n') + '\n';
}
function reasonFor(claim, conflicts) {
    const severe = conflicts.find(item => item.materiality === 'CRITICAL' || item.materiality === 'HIGH');
    if (severe)
        return `${severe.materiality} conflict`;
    if (claim.verificationStatus === 'VERIFIED')
        return '정상 검증 claim';
    return claim.verificationStatus;
}
