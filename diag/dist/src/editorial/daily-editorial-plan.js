import { createHash } from 'node:crypto';
import { findPriorCoverage, retrieveEditorialMemory } from '../library/retrieval.js';
import { buildDemandAwareEditorialContext } from './demand-aware.js';
export function buildDailyEditorialPlan(input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate))
        throw new Error('valid issueDate required');
    let memory = input.memory;
    const memoryUsed = [];
    const candidates = input.candidates.map(candidate => {
        const prior = findPriorCoverage(input.library, { ...(candidate.eventId ? { eventId: candidate.eventId } : {}), ...(candidate.continuationOfEventId ? { continuationOfEventId: candidate.continuationOfEventId } : {}), companyIds: candidate.companyIds, themeIds: candidate.themeIds, sourceRefs: candidate.sourceRefs, observedAt: input.generatedAt });
        const subjectId = candidate.companyIds[0] ?? candidate.themeIds[0];
        const subjectType = candidate.companyIds.length ? 'COMPANY' : candidate.themeIds.length ? 'THEME' : null;
        const recalled = retrieveEditorialMemory(memory, subjectId && subjectType ? { subjectType, subjectId } : {}, input.generatedAt);
        memory = recalled.store;
        memoryUsed.push(...recalled.records);
        const coverageState = coverage(prior);
        const recommendedTreatment = treatment(candidate, coverageState);
        return { ...candidate, coverageState, priorCoverage: prior, recommendedTreatment, memoryRefs: recalled.records.map(item => item.memoryId) };
    });
    const rejected = candidates.filter(item => item.recommendedTreatment === 'REJECT');
    const deferred = candidates.filter(item => item.recommendedTreatment === 'DEFER');
    const selected = candidates.filter(item => !['REJECT', 'DEFER'].includes(item.recommendedTreatment));
    const depthPass = selected.length > 0 && selected.every(item => Object.values(item.depth).every(value => value.trim().length > 0));
    const reviewState = (depthPass ? 'APPROVAL_REQUIRED' : 'MODIFY');
    const demandContext = input.searchIntelligence ? buildDemandAwareEditorialContext({ snapshot: input.searchIntelligence, candidateTopicIds: unique(selected.flatMap(item => item.themeIds)), reviewState }) : null;
    const base = { planId: `editorial-plan:${input.category.toLowerCase()}:${input.issueDate}`, category: input.category, issueDate: input.issueDate, candidates, selected, deferred, rejected, reviewState, reviewedBy: null, reviewedAt: null, weeklyFeedEligible: depthPass && selected.length > 0, contentDepthGate: (depthPass ? 'PASS' : 'FAIL'), externalActions: { bloggerLookup: 0, bloggerInsert: 0, bloggerPatch: 0, bloggerPublish: 0 }, commerce: { enabled: false }, demandContext };
    return { plan: { ...base, fingerprint: hash(base) }, memory, memoryUsed: dedupeMemory(memoryUsed) };
}
export function selectLatestCompletedDate(input) {
    const holidays = new Set(input.holidays ?? []);
    return [...new Set(input.availableDates)].filter(date => date <= input.completedThrough && !holidays.has(date)).sort().at(-1) ?? null;
}
export function registerPublishedEditorial(input) {
    if (input.plan.reviewState !== 'APPROVED')
        throw new Error('human APPROVED required before post-publish registration');
    if (!/^https:\/\//.test(input.publicPostUrl))
        throw new Error('verified public URL required');
    return { libraryRegistration: { publicationId: input.plan.planId, publicPostUrl: input.publicPostUrl }, weeklyFeed: { category: input.plan.category, issueDate: input.plan.issueDate, publicationId: input.plan.planId }, searchRegistration: { indexed: false, submittedAt: null }, memoryCandidates: input.plan.selected.map(item => ({ statement: `${item.topic}: 후속 보도에서 ${item.depth.whatNext}`, reviewState: 'REVIEW_REQUIRED' })) };
}
function coverage(prior) { return prior.state === 'NONE' ? 'NEW' : prior.state === 'FOLLOW_UP' ? 'FOLLOW_UP' : prior.state === 'DUPLICATE' ? 'DUPLICATE' : 'RELATED'; }
function treatment(candidate, state) { if (state === 'DUPLICATE')
    return 'REJECT'; if (state === 'FOLLOW_UP')
    return 'FOLLOW_UP'; if (candidate.recommendedTreatment)
    return candidate.recommendedTreatment; if (candidate.lead)
    return 'LEAD'; return 'STANDARD'; }
function hash(value) { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
function dedupeMemory(items) { return [...new Map(items.map(item => [item.memoryId, item])).values()]; }
function unique(items) { return [...new Set(items)]; }
